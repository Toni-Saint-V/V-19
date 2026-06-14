import type { Applicant } from "../types/domain";
import { requiredApplicantFields } from "../lib/workflow";
import type {
  BlsApplicantFieldSpec,
  BlsAppointmentFieldSpec,
} from "./textIntakeReviewTypes";

export const placeholderValues = new Set([
  "-",
  "--",
  "—",
  "— выберите —",
  "n/a",
  "na",
  "unknown",
  "todo",
  "test",
  "тест",
  "уточнить",
  "неизвестно",
  "нет данных",
  "not applicable",
]);

export const fieldLabels = new Map<keyof Applicant, string>(
  requiredApplicantFields.map(({ key, label }) => [key, label]),
);

export const textReviewGuardrails = [
  "Текстовая проверка смотрит только поля анкеты; фото и видео остаются ручной проверкой медиа.",
  "Замечания являются черновиками исправлений, а не решением по исходу или официальной проверкой.",
  "Готовность и передача зависят от deterministic preflight и ручной проверки.",
];

export const blsAppointmentFields: BlsAppointmentFieldSpec[] = [
  { key: "city", label: "Город подачи", required: true },
  { key: "visa_type", label: "Тип визы", required: true },
  { key: "visa_category", label: "Категория", required: true },
  { key: "schedule_date1", label: "Желаемая дата 1", required: false, date: true },
  { key: "schedule_date2", label: "Желаемая дата 2", required: false, date: true },
  { key: "schedule_date3", label: "Желаемая дата 3", required: false, date: true },
  { key: "note", label: "Примечание", required: false },
];

export const blsApplicantFields: BlsApplicantFieldSpec[] = [
  {
    key: "first_name",
    label: "First Name (Given Name)",
    required: true,
    latin: true,
  },
  {
    key: "relation_to_primary",
    label: "Relation to primary applicant",
    required: false,
  },
  {
    key: "last_name",
    label: "Surname (Family Name)",
    required: true,
    latin: true,
  },
  { key: "maiden_name", label: "Maiden Name", required: true, latin: true },
  {
    key: "surname_at_birth",
    label: "Surname At Birth",
    required: true,
    latin: true,
  },
  { key: "birth_date", label: "Date of Birth", required: true, date: true },
  { key: "birth_place", label: "Place of Birth", required: true, latin: true },
  { key: "birth_country", label: "Country of Birth", required: true },
  { key: "current_nationality", label: "Current Nationality", required: true },
  { key: "gender", label: "Gender", required: true },
  { key: "marital_status", label: "Marital Status", required: true },
  { key: "passport_type", label: "Passport Type", required: true },
  {
    key: "passport_number",
    label: "Passport No",
    required: true,
    passport: true,
  },
  {
    key: "passport_issued_at",
    label: "Passport Issue Date",
    required: true,
    date: true,
  },
  {
    key: "passport_expires_at",
    label: "Passport Expiry Date",
    required: true,
    date: true,
  },
  { key: "travel_date", label: "Travel Date", required: true, date: true },
  { key: "address_line1", label: "Home Address Line 1", required: true },
  { key: "country", label: "Country", required: true },
  { key: "addr_city", label: "City", required: true },
  { key: "postal_code", label: "Postal Code", required: true },
  { key: "phone", label: "Contact Number", required: true, phone: true },
  { key: "email", label: "Email", required: true, email: true },
  { key: "employer_name", label: "Employer Name", required: true },
  { key: "occupation", label: "Occupation", required: true },
  { key: "occupation_other", label: "Occupation (specify)", required: false },
  { key: "work_phone", label: "Employer Contact Number", required: true, phone: true },
  { key: "work_address", label: "Employer Address", required: true },
  { key: "trip_purpose", label: "Purpose of Journey", required: true },
  { key: "stay_duration", label: "Stay Duration in Days", required: true },
  { key: "entries_number", label: "Number of Entries", required: true },
  {
    key: "arrival_date",
    label: "Intended Date of Arrival",
    required: true,
    date: true,
  },
  {
    key: "departure_date",
    label: "Intended Date of Departure",
    required: true,
    date: true,
  },
  { key: "host_type", label: "Inviting Party Type", required: true },
  { key: "host_name", label: "Name", required: true },
  { key: "host_country", label: "Country", required: true },
  { key: "host_city", label: "City", required: true },
  { key: "host_postal", label: "Postal Code", required: true },
  { key: "host_address", label: "Address", required: true },
  { key: "host_email", label: "Email", required: true, email: true },
  { key: "host_phone", label: "Contact Number", required: true, phone: true },
  { key: "cost_covered_by", label: "Cost Covered By", required: true },
  { key: "means_of_support", label: "Means of Support", required: true },
];
