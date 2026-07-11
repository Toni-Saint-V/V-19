import { validateQuestionnaireFieldValue } from './questionnaire';
import type { Applicant, QuestionnaireField, Submission } from './types';

export const BLS_REQUIRED_FILE_TYPES = ['passport_scan', 'selfie', 'selfie_2'] as const;

export type BlsRequiredFileType = (typeof BLS_REQUIRED_FILE_TYPES)[number];

export type BlsFormData = Record<string, string | undefined>;

export type BlsQuestionnaireReadiness = {
  blockingIssueCount: number;
  completedRequiredFieldCount: number;
  percent: number;
  ready: boolean;
  requiredFieldCount: number;
};

export type BlsFieldForValidation = Pick<
  QuestionnaireField,
  'id' | 'label' | 'required' | 'value' | 'error' | 'reviewState'
>;

export type BlsFieldValidationContext = {
  applicantRole?: Applicant['role'];
  field: BlsFieldForValidation;
  formData: BlsFormData;
  value?: string;
};

const nonWorkingOccupations = new Set([
  'HOUSEWIFE',
  'MINOR',
  'PENSIONER',
  'RETIRED',
  'UNEMPLOYED',
]);

const businessPurposeValues = new Set([
  'BUSINESS',
  'CULTURAL',
  'MEDICAL TREATMENT',
  'OFFICIAL VISIT',
  'SPORTS',
  'STUDY',
]);

const blsFormKeyByQuestionnaireFieldId: Record<string, string> = {
  'birth-date': 'dob',
  'company-contact-person': 'companyContactPerson',
  'company-org-details': 'companyOrgDetails',
  'company-phone': 'companyPhone',
  'cost-covered-by': 'paymentSponsor',
  'departure-date': 'travelEnd',
  'entry-permit-final-country': 'finalEntryPermit',
  'entry-permit-issued-by': 'finalEntryPermitIssuedBy',
  'entry-permit-valid-from': 'finalEntryPermitValidFrom',
  'entry-permit-valid-to': 'finalEntryPermitValidTo',
  'eu-citizen-relative-details': 'euRelativeDetails',
  'eu-relative-details': 'euRelativeDetails',
  'eu-relative-relationship': 'euRelationship',
  'eu-relationship': 'euRelationship',
  'filler-contact': 'formFillerContact',
  'filler-name': 'formFillerName',
  'filler-phone': 'formFillerPhone',
  'final-entry-permit': 'finalEntryPermit',
  'final-entry-permit-issued-by': 'finalEntryPermitIssuedBy',
  'final-entry-permit-valid-from': 'finalEntryPermitValidFrom',
  'final-entry-permit-valid-to': 'finalEntryPermitValidTo',
  'form-filler-contact': 'formFillerContact',
  'form-filler-name': 'formFillerName',
  'form-filler-phone': 'formFillerPhone',
  'inviting-party-type': 'invitingPartyType',
  'lives-outside-citizenship': 'livesOutsideCitizenship',
  'means-of-sponsor-support': 'sponsorMeans',
  'occupation': 'occupation',
  'organization-contact-person': 'companyContactPerson',
  'organization-details': 'companyOrgDetails',
  'organization-phone': 'companyPhone',
  'other-sponsor': 'otherSponsor',
  'passport-expiry-date': 'passportExpiry',
  'passport-issue-date': 'passportIssued',
  'previous-biometrics': 'previousBiometrics',
  'purpose': 'stayPurpose',
  'residence-not-nationality': 'livesOutsideCitizenship',
  'sponsor-fields-30-31': 'sponsorInHostFields',
  'sponsor-in-host-fields': 'sponsorInHostFields',
  'sponsor-means': 'sponsorMeans',
  'sponsor-name': 'otherSponsor',
  'travel-start': 'travelStart',
  'arrival-date': 'travelStart',
};

function read(formData: BlsFormData, key: string) {
  return (formData[key] ?? '').trim();
}

function normalizeForRule(value: string) {
  return value.trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
}

function yes(value: string) {
  const normalized = normalizeForRule(value);
  return normalized === 'да' || normalized === 'yes' || normalized === 'true';
}

function no(value: string) {
  const normalized = normalizeForRule(value);
  return normalized === 'нет' || normalized === 'no' || normalized === 'false';
}

function sponsor(value: string) {
  return normalizeForRule(value).includes('спонсор') || normalizeForRule(value).includes('sponsor');
}

function isOtherLike(value: string) {
  const normalized = normalizeForRule(value);
  return normalized === 'other' || normalized.includes('другое') || normalized.includes('other');
}

export function isBlsQuestionnaireInvitingCompanySelected(formData: BlsFormData) {
  const invitingPartyType = normalizeForRule(read(formData, 'invitingPartyType'));
  const stayPurpose = read(formData, 'stayPurpose').toUpperCase();

  return (
    invitingPartyType.includes('компания') ||
    invitingPartyType.includes('организация') ||
    businessPurposeValues.has(stayPurpose)
  );
}

function fillerGroupStarted(formData: BlsFormData) {
  return Boolean(
    read(formData, 'formFillerName') ||
      read(formData, 'formFillerContact') ||
      read(formData, 'formFillerPhone'),
  );
}

function euRelativeGroupStarted(formData: BlsFormData) {
  return Boolean(read(formData, 'euRelativeDetails') || read(formData, 'euRelationship'));
}

function finalEntryPermitGroupStarted(formData: BlsFormData) {
  return Boolean(
    read(formData, 'finalEntryPermit') ||
      read(formData, 'finalEntryPermitIssuedBy') ||
      read(formData, 'finalEntryPermitValidFrom') ||
      read(formData, 'finalEntryPermitValidTo'),
  );
}

function companyInvitationGroupStarted(formData: BlsFormData) {
  return Boolean(
    read(formData, 'companyOrgDetails') ||
      read(formData, 'companyContactPerson') ||
      read(formData, 'companyPhone'),
  );
}

function sponsorGroupStarted(formData: BlsFormData) {
  return Boolean(
    read(formData, 'sponsorInHostFields') ||
      read(formData, 'otherSponsor') ||
      read(formData, 'sponsorMeans'),
  );
}

function fieldHasOwnValue(field: BlsFieldForValidation) {
  return Boolean((field.value ?? '').trim());
}

export function isBlsQuestionnaireMinorApplicant(
  applicantRole: Applicant['role'] | undefined,
  formData: BlsFormData,
) {
  if (applicantRole === 'child') return true;

  const birthDate = parseBlsQuestionnaireDate(read(formData, 'dob'));
  if (!birthDate) return false;

  const travelStart = parseBlsQuestionnaireDate(read(formData, 'travelStart')) ?? new Date();
  let age = travelStart.getFullYear() - birthDate.getFullYear();
  const monthDelta = travelStart.getMonth() - birthDate.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && travelStart.getDate() < birthDate.getDate())) {
    age -= 1;
  }

  return age < 18;
}

export function isBlsQuestionnaireFieldApplicable({
  applicantRole,
  field,
  formData,
}: Pick<BlsFieldValidationContext, 'applicantRole' | 'field' | 'formData'>) {
  const hasOwnValue = fieldHasOwnValue(field);

  switch (field.id) {
    case 'guardian-info':
      return isBlsQuestionnaireMinorApplicant(applicantRole, formData) || hasOwnValue;

    case 'eu-relative-details':
    case 'eu-relationship':
      return euRelativeGroupStarted(formData) || hasOwnValue;

    case 'birth-citizenship':
    case 'other-citizenship':
    case 'national-id':
      return hasOwnValue;

    case 'residence-permit-type':
    case 'residence-permit-number':
    case 'residence-permit-valid-until':
      return yes(read(formData, 'livesOutsideCitizenship')) || hasOwnValue;

    case 'occupation-specify':
      return isOtherLike(read(formData, 'occupation')) || hasOwnValue;

    case 'employer-name':
    case 'employer-contact':
    case 'employer-address':
      return occupationRequiresEmployer(formData) || hasOwnValue;

    case 'stay-purpose-details':
      return isOtherLike(read(formData, 'stayPurpose')) || hasOwnValue;

    case 'previous-biometrics-date':
      return yes(read(formData, 'previousBiometrics')) || hasOwnValue;

    case 'previous-visa-number':
      return yes(read(formData, 'previousBiometrics')) || hasOwnValue;

    case 'final-entry-permit':
    case 'final-entry-permit-issued-by':
    case 'final-entry-permit-valid-from':
    case 'final-entry-permit-valid-to':
      return finalEntryPermitGroupStarted(formData) || hasOwnValue;

    case 'company-org-details':
    case 'company-contact-person':
    case 'company-phone':
      return (
        isBlsQuestionnaireInvitingCompanySelected(formData) ||
        companyInvitationGroupStarted(formData) ||
        hasOwnValue
      );

    case 'means-of-support':
      return !sponsor(read(formData, 'paymentSponsor')) || hasOwnValue;

    case 'sponsor-in-host-fields':
    case 'sponsor-means':
      return sponsor(read(formData, 'paymentSponsor')) || sponsorGroupStarted(formData) || hasOwnValue;

    case 'other-sponsor':
      return (
        (sponsor(read(formData, 'paymentSponsor')) && no(read(formData, 'sponsorInHostFields'))) ||
        hasOwnValue
      );

    case 'form-filler-name':
    case 'form-filler-contact':
    case 'form-filler-phone':
      return fillerGroupStarted(formData) || hasOwnValue;

    default:
      return true;
  }
}

export function isBlsQuestionnaireSectionApplicable(
  sectionId: string,
  formData: BlsFormData,
  applicantRole?: Applicant['role'],
) {
  switch (sectionId) {
    case 'files':
      return false;
    case 'euRelative':
      return euRelativeGroupStarted(formData);
    case 'filler':
      return fillerGroupStarted(formData);
    case 'appointment':
    case 'personal':
    case 'passport':
    case 'contacts':
    case 'contact':
    case 'employment':
    case 'trip':
    case 'hotel':
    case 'payment':
      return true;
    default:
      return applicantRole !== undefined || Object.values(formData).some((value) => Boolean(value?.trim()));
  }
}

export function parseBlsQuestionnaireDate(value: string) {
  const trimmed = value.trim();
  const dotted = /^(\d{2})[.-](\d{2})[.-](\d{4})$/.exec(trimmed);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!dotted && !iso) return null;

  const year = Number(iso ? iso[1] : dotted?.[3]);
  const month = Number(iso ? iso[2] : dotted?.[2]);
  const day = Number(iso ? iso[3] : dotted?.[1]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function daysInclusive(from: Date, to: Date) {
  const dayMs = 24 * 60 * 60 * 1000;
  const fromUtc = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const toUtc = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((toUtc - fromUtc) / dayMs) + 1;
}

function occupationRequiresEmployer(formData: BlsFormData) {
  const occupation = read(formData, 'occupation').toUpperCase();
  if (!occupation) return true;
  return !nonWorkingOccupations.has(occupation);
}

export function isBlsQuestionnaireFieldRequired({
  applicantRole,
  field,
  formData,
}: Pick<BlsFieldValidationContext, 'applicantRole' | 'field' | 'formData'>) {
  if (!isBlsQuestionnaireFieldApplicable({ applicantRole, field, formData })) return false;

  switch (field.id) {
    case 'appointment-note':
    case 'birth-citizenship':
    case 'final-entry-permit':
    case 'final-entry-permit-issued-by':
    case 'final-entry-permit-valid-from':
    case 'final-entry-permit-valid-to':
    case 'national-id':
    case 'other-citizenship':
    case 'previous-surname':
    case 'previous-visa-number':
      return false;

    case 'desired-date-2':
    case 'desired-date-3':
      return false;

    case 'guardian-info':
      return isBlsQuestionnaireMinorApplicant(applicantRole, formData);

    case 'eu-relative-details':
    case 'eu-relationship':
      return euRelativeGroupStarted(formData);

    case 'residence-permit-type':
    case 'residence-permit-number':
    case 'residence-permit-valid-until':
      return yes(read(formData, 'livesOutsideCitizenship'));

    case 'occupation-specify':
      return isOtherLike(read(formData, 'occupation'));

    case 'employer-name':
    case 'employer-contact':
    case 'employer-address':
      return occupationRequiresEmployer(formData);

    case 'stay-purpose-details':
      return isOtherLike(read(formData, 'stayPurpose'));

    case 'previous-biometrics-date':
      return yes(read(formData, 'previousBiometrics'));

    case 'company-org-details':
    case 'company-contact-person':
    case 'company-phone':
      return isBlsQuestionnaireInvitingCompanySelected(formData);

    case 'means-of-support':
      return !sponsor(read(formData, 'paymentSponsor'));

    case 'sponsor-in-host-fields':
    case 'sponsor-means':
      return sponsor(read(formData, 'paymentSponsor'));

    case 'other-sponsor':
      return sponsor(read(formData, 'paymentSponsor')) && no(read(formData, 'sponsorInHostFields'));

    case 'form-filler-name':
    case 'form-filler-contact':
    case 'form-filler-phone':
      return fillerGroupStarted(formData);

    default:
      return field.required;
  }
}

export function validateBlsQuestionnaireField({
  applicantRole,
  field,
  formData,
  value = field.value,
}: BlsFieldValidationContext) {
  if (!isBlsQuestionnaireFieldApplicable({ applicantRole, field, formData })) return undefined;

  const trimmed = value.trim();
  const required = isBlsQuestionnaireFieldRequired({ applicantRole, field, formData });
  const baseError = validateQuestionnaireFieldValue(
    { ...field, required, value: trimmed },
    trimmed,
  );

  if (baseError) return baseError;
  if (!trimmed) return undefined;

  if (field.id === 'birth-date') {
    const birthDate = parseBlsQuestionnaireDate(trimmed);
    const travelStart = parseBlsQuestionnaireDate(read(formData, 'travelStart'));
    if (birthDate && travelStart && birthDate >= travelStart) {
      return 'Дата рождения должна быть раньше даты поездки';
    }
  }

  if (field.id === 'passport-issue-date') {
    const issueDate = parseBlsQuestionnaireDate(trimmed);
    const expiryDate = parseBlsQuestionnaireDate(read(formData, 'passportExpiry'));
    if (issueDate && expiryDate && issueDate >= expiryDate) {
      return 'Дата выдачи должна быть раньше даты окончания';
    }
  }

  if (field.id === 'passport-expiry-date') {
    const issueDate = parseBlsQuestionnaireDate(read(formData, 'passportIssued'));
    const expiryDate = parseBlsQuestionnaireDate(trimmed);
    const travelEnd = parseBlsQuestionnaireDate(read(formData, 'travelEnd'));
    if (issueDate && expiryDate && expiryDate <= issueDate) {
      return 'Дата окончания должна быть позже даты выдачи';
    }
    if (expiryDate && travelEnd && expiryDate < travelEnd) {
      return 'Паспорт должен быть действителен на дату выезда';
    }
  }

  if (field.id === 'arrival-date' || field.id === 'departure-date') {
    const arrivalDate = parseBlsQuestionnaireDate(
      field.id === 'arrival-date' ? trimmed : read(formData, 'travelStart'),
    );
    const departureDate = parseBlsQuestionnaireDate(
      field.id === 'departure-date' ? trimmed : read(formData, 'travelEnd'),
    );
    if (arrivalDate && departureDate && departureDate < arrivalDate) {
      return 'Дата выезда должна быть не раньше даты въезда';
    }
  }

  if (field.id === 'stay-duration') {
    if (!/^\d+$/.test(trimmed)) return 'Введите количество дней числом';
    const duration = Number(trimmed);
    if (duration <= 0 || duration > 365) return 'Проверьте длительность пребывания';

    const arrivalDate = parseBlsQuestionnaireDate(read(formData, 'travelStart'));
    const departureDate = parseBlsQuestionnaireDate(read(formData, 'travelEnd'));
    if (arrivalDate && departureDate && departureDate >= arrivalDate) {
      const expected = daysInclusive(arrivalDate, departureDate);
      if (duration !== expected) return `Длительность должна быть ${expected} дн.`;
    }
  }

  if (field.id === 'postal-code' || field.id === 'hotel-postal-code') {
    return /^[A-Z0-9][A-Z0-9\s-]{1,14}[A-Z0-9]$/i.test(trimmed)
      ? undefined
      : 'Проверьте почтовый индекс';
  }

  return undefined;
}

export function isBlsQuestionnaireFieldReady(context: BlsFieldValidationContext) {
  if (!isBlsQuestionnaireFieldApplicable(context)) return true;

  const required = isBlsQuestionnaireFieldRequired(context);
  const value = (context.value ?? context.field.value).trim();
  if (!required && !value) return true;
  if (required && !value) return false;
  return !validateBlsQuestionnaireField(context);
}

export function isBlsQuestionnaireFieldBlockingIssue(context: BlsFieldValidationContext) {
  if (!isBlsQuestionnaireFieldApplicable(context)) return false;

  if (context.field.reviewState === 'needs_review') return true;

  const value = (context.value ?? context.field.value).trim();
  const validationMessage = validateBlsQuestionnaireField(context);
  if (!validationMessage) return false;
  return value.length > 0 || validationMessage !== 'Обязательное поле';
}

export function isBlsQuestionnaireFileReady(file: Submission['files'][number] | undefined) {
  if (!file) return false;
  if (file.status === 'missing' || file.status === 'needs_replacement') return false;
  if (file.uploadStatus && file.uploadStatus !== 'uploaded') return false;
  if (
    file.reviewStatus === 'replace_required' ||
    file.reviewStatus === 'poor_quality'
  ) {
    return false;
  }
  return true;
}

function blsFormDataForApplicant(applicant: Applicant): BlsFormData {
  const formData: BlsFormData = {};

  for (const field of applicant.sections.flatMap((section) => section.fields)) {
    const formKey = blsFormKeyByQuestionnaireFieldId[field.id];
    if (!formKey) continue;

    const currentValue = formData[formKey] ?? '';
    if (!currentValue.trim() || field.value.trim()) {
      formData[formKey] = field.value;
    }
  }

  return formData;
}

export function blsQuestionnaireReadiness(
  submission: Pick<Submission, 'applicants'>,
): BlsQuestionnaireReadiness {
  let blockingIssueCount = 0;
  let completedRequiredFieldCount = 0;
  let requiredFieldCount = 0;

  for (const applicant of submission.applicants) {
    const formData = blsFormDataForApplicant(applicant);

    for (const field of applicant.sections.flatMap((section) => section.fields)) {
      const context = {
        applicantRole: applicant.role,
        field,
        formData,
      } satisfies BlsFieldValidationContext;

      if (isBlsQuestionnaireFieldRequired(context)) {
        requiredFieldCount += 1;
        if (isBlsQuestionnaireFieldReady(context)) {
          completedRequiredFieldCount += 1;
        }
      }

      if (isBlsQuestionnaireFieldBlockingIssue(context)) {
        blockingIssueCount += 1;
      }
    }
  }

  const percent = requiredFieldCount
    ? Math.round((completedRequiredFieldCount / requiredFieldCount) * 100)
    : 0;

  return {
    blockingIssueCount,
    completedRequiredFieldCount,
    percent,
    ready:
      requiredFieldCount > 0 &&
      completedRequiredFieldCount === requiredFieldCount &&
      blockingIssueCount === 0,
    requiredFieldCount,
  };
}
