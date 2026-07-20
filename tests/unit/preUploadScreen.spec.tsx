import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { PreUploadScreen } from '../../src/components/PreUploadScreen';
import {
  invokePassportExtraction,
  prewarmLocalPassportOcr,
} from '../../src/modules/submissions/passportExtractionService';

vi.mock('../../src/modules/submissions/passportExtractionService', () => ({
  invokePassportExtraction: vi.fn(async () => ({
    fields: [],
    status: 'unavailable',
    summary: 'Local OCR unavailable.',
  })),
  prewarmLocalPassportOcr: vi.fn(async () => undefined),
}));

beforeEach(() => {
  vi.mocked(invokePassportExtraction).mockReset();
  vi.mocked(invokePassportExtraction).mockResolvedValue({
    fields: [],
    guardrails: [],
    source: 'edge-stub',
    status: 'unavailable',
    summary: 'Local OCR unavailable.',
  });
  vi.mocked(prewarmLocalPassportOcr).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('PreUploadScreen', () => {
  test('prewarms local passport OCR when the screen opens', async () => {
    render(<PreUploadScreen onBack={() => undefined} />);

    await waitFor(() => expect(prewarmLocalPassportOcr).toHaveBeenCalledTimes(1));
  });

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
    expect(screen.getByTestId('preupload-single-grid')).toBeVisible();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    const nextButton = screen.getByRole('button', { name: 'Далее' });
    expect(nextButton).toBeEnabled();
    fireEvent.click(nextButton);

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    const [draft] = onComplete.mock.calls[0];
    expect(draft.type).toBe('single');
    expect(draft.files).toEqual([]);
    expect(draft.applicants).toHaveLength(1);
  });

  test('shows two compact family applicants with one next-slot add control', () => {
    render(<PreUploadScreen onBack={() => undefined} />);

    expect(screen.queryByTestId('preupload-applicant-count')).not.toBeInTheDocument();
    expect(screen.queryByText(/Паспорта загружайте по порядку/)).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Загрузить паспорт: Основной заявитель' }),
    ).toHaveTextContent('1Основной заявитель');
    expect(
      screen.getByRole('button', { name: 'Загрузить паспорт: Второй заявитель' }),
    ).toHaveTextContent('2Второй заявитель');
    expect(screen.getByRole('heading', { name: 'Prefill-поля' })).toBeInTheDocument();
    expect(screen.getByText('Поля появляются здесь по мере распознавания паспорта.')).toBeInTheDocument();
    expect(screen.queryByText(/Критичных расхождений нет/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.queryByText('У вас одинаковый адрес проживания в России?')).not.toBeInTheDocument();
    expect(screen.queryByText('У вас одинаковый адрес проживания в Испании?')).not.toBeInTheDocument();

    const addApplicant = screen.getByRole('button', {
      name: 'Добавить следующего заявителя',
    });
    expect(addApplicant).toBeVisible();
    fireEvent.click(addApplicant);
    expect(
      screen.getByRole('button', { name: 'Загрузить паспорт: Заявитель 3' }),
    ).toBeVisible();
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
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
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
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
        {
          confidence: 'high',
          key: 'birthDate',
          needsManualReview: false,
          value: '20.08.1990',
        },
        {
          confidence: 'high',
          key: 'passportNumber',
          needsManualReview: false,
          value: '752869613',
        },
        {
          confidence: 'high',
          key: 'passportExpiresAt',
          needsManualReview: false,
          value: '26.02.2026',
        },
      ],
      guardrails: [],
      source: 'local-ocr',
      status: 'extracted',
      summary: 'Passport extracted.',
    });
    const { container } = render(
      <PreUploadScreen initialPackageType="single" onBack={() => undefined} />,
    );
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
    expect(
      screen.getByText('№ 752869613 · 20.08.1990 · до 26.02.2026 · 5 полей'),
    ).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Заменить паспорт' })).toBeVisible();
    expect(screen.queryByText('volkov.jpeg')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole('dialog', { name: 'Распознанные OCR-поля' }),
      ).toBeVisible(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Распознанные OCR-поля' }),
      ).not.toBeInTheDocument(),
    );
    const openPrefill = screen.getByRole('button', {
      name: 'Открыть распознанные OCR-поля',
    });
    fireEvent.click(openPrefill);
    await waitFor(() =>
      expect(
        screen.getByRole('dialog', { name: 'Распознанные OCR-поля' }),
      ).toBeVisible(),
    );
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

  test('continues after the first passport times out and keeps the second result on its applicantIndex', async () => {
    vi.useFakeTimers();
    const invokeMock = vi.mocked(invokePassportExtraction);
    const extractedResult = (firstName: string, surname: string) => ({
      fields: [
        {
          confidence: 'high' as const,
          key: 'firstName' as const,
          needsManualReview: false,
          value: firstName,
        },
        {
          confidence: 'high' as const,
          key: 'surname' as const,
          needsManualReview: false,
          value: surname,
        },
      ],
      guardrails: [],
      source: 'local-ocr' as const,
      status: 'extracted' as const,
      summary: 'Passport extracted.',
    });
    invokeMock.mockImplementation((input) =>
      input.applicantIndex === 0
        ? new Promise((_, reject) => {
            window.setTimeout(() => reject(new Error('Local passport OCR timed out.')), 45_000);
          })
        : Promise.resolve(extractedResult('SECOND', 'APPLICANT')),
    );
    const onComplete = vi.fn();
    const { container } = render(
      <PreUploadScreen onBack={() => undefined} onComplete={onComplete} />,
    );
    const firstPassport = new File(['first'], 'first-passport.jpeg', { type: 'image/jpeg' });
    const secondPassport = new File(['second'], 'second-passport.jpeg', { type: 'image/jpeg' });
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();

    fireEvent.change(fileInput!, { target: { files: [firstPassport, secondPassport] } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(950);
    });
    expect(invokeMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(44_000);
    });
    expect(invokeMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(invokeMock).toHaveBeenCalledTimes(2);
    expect(invokeMock.mock.calls.map(([input]) => input.applicantIndex)).toEqual([0, 1]);
    expect(
      screen.getByRole('button', { name: 'Заменить паспорт: SECOND APPLICANT' }),
    ).toBeVisible();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Далее' }));
      await Promise.resolve();
    });
    const [draft] = onComplete.mock.calls[0];
    expect(draft.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ applicantIndex: 0, status: 'needs_review' }),
        expect.objectContaining({
          applicantIndex: 1,
          extractedValues: expect.objectContaining({ firstName: 'SECOND' }),
          status: 'recognized',
        }),
      ]),
    );
  });
});
