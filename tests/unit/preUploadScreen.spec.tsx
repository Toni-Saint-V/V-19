import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { PreUploadScreen } from '../../src/components/PreUploadScreen';
import { invokePassportExtraction } from '../../src/modules/submissions/passportExtractionService';

vi.mock('../../src/modules/submissions/passportExtractionService', () => ({
  invokePassportExtraction: vi.fn(async () => ({
    fields: [],
    status: 'unavailable',
    summary: 'Local OCR unavailable.',
  })),
}));

describe('PreUploadScreen', () => {
  test('keeps Next available for a single applicant without a passport', async () => {
    const onComplete = vi.fn();
    render(
      <PreUploadScreen
        initialPackageType="single"
        onBack={() => undefined}
        onComplete={onComplete}
      />,
    );

    expect(screen.queryByTestId('preupload-family-grid')).not.toBeInTheDocument();
    const nextButton = screen.getByRole('button', { name: 'Далее' });
    expect(nextButton).toBeEnabled();
    fireEvent.click(nextButton);

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    const [draft] = onComplete.mock.calls[0];
    expect(draft.type).toBe('single');
    expect(draft.files).toEqual([]);
    expect(draft.applicants).toHaveLength(1);
  });

  test('shows two compact family applicants without shared-address questions and adds slots', () => {
    render(<PreUploadScreen onBack={() => undefined} />);

    expect(screen.getByRole('heading', { name: 'Prefill-поля' })).toBeInTheDocument();
    expect(screen.getByText('Поля появляются здесь по мере распознавания паспорта.')).toBeInTheDocument();
    expect(screen.queryByText(/Критичных расхождений нет/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByText('У вас одинаковый адрес проживания в России?')).not.toBeInTheDocument();
    expect(screen.queryByText('У вас одинаковый адрес проживания в Испании?')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Добавить заявителя' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  test('binds a passport chosen from a family cell to that exact applicant', async () => {
    const onComplete = vi.fn();
    const { container } = render(
      <PreUploadScreen onBack={() => undefined} onComplete={onComplete} />,
    );
    const passport = new File(['passport'], 'passport-child.jpeg', {
      type: 'image/jpeg',
    });

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Загрузить паспорт: Второй заявитель',
      }),
    );
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();
    fireEvent.change(fileInput!, { target: { files: [passport] } });
    fireEvent.click(screen.getByRole('button', { name: 'Далее' }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    const [draft] = onComplete.mock.calls[0];
    expect(draft.files).toEqual([
      expect.objectContaining({ applicantIndex: 1, name: passport.name }),
    ]);
  });

  test('shows the extracted applicant name and a recognized passport state', async () => {
    vi.mocked(invokePassportExtraction).mockResolvedValueOnce({
      fields: [
        {
          confidence: 'high',
          key: 'firstName',
          needsManualReview: false,
          value: 'ANTON',
        },
        {
          confidence: 'high',
          key: 'surname',
          needsManualReview: false,
          value: 'VOLKOV',
        },
      ],
      guardrails: [],
      source: 'local-ocr',
      status: 'extracted',
      summary: 'Passport extracted.',
    });
    const { container } = render(<PreUploadScreen onBack={() => undefined} />);
    const passport = new File(['passport'], 'volkov.jpeg', { type: 'image/jpeg' });

    fireEvent.click(
      screen.getByRole('button', { name: 'Загрузить паспорт: Основной заявитель' }),
    );
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();
    fireEvent.change(fileInput!, { target: { files: [passport] } });

    await waitFor(() => {
      const extractedName = screen.getByRole('button', {
        name: 'Заменить паспорт: ANTON VOLKOV',
      });
      expect(extractedName).toBeVisible();
      const recognizedApplicant = extractedName.closest('article');
      expect(recognizedApplicant).toHaveClass('is-recognized');
      expect(recognizedApplicant?.querySelector('.v19-preupload-passport-icon')).toBeInTheDocument();
      expect(recognizedApplicant?.querySelector('.v19-preupload-remove-icon')).toBeInTheDocument();
    });
    expect(
      screen.getByRole('button', { name: 'Удалить паспорт: ANTON VOLKOV' }),
    ).toBeVisible();
    expect(screen.queryByText('volkov.jpeg')).not.toBeInTheDocument();
  });

  test('shows numeric progress while passport extraction is running', async () => {
    vi.mocked(invokePassportExtraction).mockImplementationOnce(
      () => new Promise(() => undefined),
    );
    const { container } = render(<PreUploadScreen onBack={() => undefined} />);
    const passport = new File(['passport'], 'progress.jpeg', { type: 'image/jpeg' });

    fireEvent.click(
      screen.getByRole('button', { name: 'Загрузить паспорт: Основной заявитель' }),
    );
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();
    fireEvent.change(fileInput!, { target: { files: [passport] } });

    await waitFor(() => {
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '86');
      expect(screen.getByText('86%')).toBeVisible();
    });
  });
});
