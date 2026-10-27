import {
  dateRangeUtils,
  DateRangeValue,
  InputProperty,
  InputPropertyMap,
  MarkdownVariant,
  Property,
} from '@activepieces/pieces-framework';
import { twentyApi } from './api';
import { twentyMetadataUtils } from './metadata';
import {
  FilterCondition,
  FilterOperator,
  FilterValue,
  SelectOption,
  TwentyAuthValue,
  TwentyMetadataField,
} from './types';

const CONDITION_KEY_DELIMITER = '_';

const LIST_OPERATORS: FilterOperator[] = ['in', 'containsAny'];

const TEXT_OPERATORS: FilterOperator[] = [
  'eq',
  'neq',
  'ilike',
  'like',
  'startsWith',
  'in',
];

const NUMBER_OPERATORS: FilterOperator[] = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
];

const CHOICE_OPERATORS: FilterOperator[] = ['eq', 'neq', 'in'];

const OPERATORS_BY_TYPE: Record<string, FilterOperator[]> = {
  NUMBER: NUMBER_OPERATORS,
  NUMERIC: NUMBER_OPERATORS,
  BOOLEAN: ['eq'],
  SELECT: CHOICE_OPERATORS,
  RATING: CHOICE_OPERATORS,
  RELATION: CHOICE_OPERATORS,
  UUID: CHOICE_OPERATORS,
  CURRENCY: ['eq', 'neq'],
  MULTI_SELECT: ['containsAny'],
  ARRAY: ['containsAny'],
  DATE_TIME: [],
  DATE: [],
};

const OPERATORS: Record<FilterOperator, OperatorDefinition> = {
  eq: { label: 'equals', description: 'Exact match.' },
  neq: { label: 'does not equal', description: 'Anything but this.' },
  in: { label: 'is any of', description: 'Comma-separated, e.g. A, B.' },
  is: { label: 'is', description: 'NULL or NOT_NULL.' },
  gt: { label: 'is greater than', description: 'Higher than this.' },
  gte: { label: 'is greater than or equal to', description: 'This or higher.' },
  lt: { label: 'is less than', description: 'Lower than this.' },
  lte: { label: 'is less than or equal to', description: 'This or lower.' },
  startsWith: { label: 'starts with', description: 'Begins with this.' },
  like: {
    label: 'matches (case-sensitive)',
    description: 'Use % as wildcard, e.g. %acme%.',
  },
  ilike: {
    label: 'matches (case-insensitive)',
    description: 'Use % as wildcard, e.g. %acme%.',
  },
  containsAny: { label: 'contains any of', description: 'At least one.' },
};

const TEXT_VALUE_DESCRIPTION = 'The text to compare against.';

const VALUE_DESCRIPTIONS: Record<string, string> = {
  RELATION: 'The ID of the related record.',
  UUID: 'The ID to compare against.',
  NUMBER: 'The number to compare against.',
  NUMERIC: 'The number to compare against.',
  DATE: 'Only records in this range are returned.',
  DATE_TIME: 'Only records in this range are returned.',
  SELECT: 'The option to compare against.',
  RATING: 'The rating to compare against.',
  MULTI_SELECT: 'The options to compare against.',
  BOOLEAN:
    'Checked finds records where this is true, unchecked where it is false.',
};

async function buildConditionProps({
  auth,
  filterBy,
}: {
  auth: TwentyAuthValue;
  filterBy: unknown[];
}): Promise<InputPropertyMap> {
  const fieldIds = filterBy.filter(
    (fieldId): fieldId is string => typeof fieldId === 'string'
  );
  const entries = await Promise.all(
    fieldIds.map((fieldId) => buildFieldProps({ auth, fieldId }))
  );
  return Object.fromEntries(entries.flat());
}

function groupConditions({
  conditions,
  delimiter,
}: {
  conditions: FlatConditions;
  delimiter: string;
}): GroupedConditions {
  return Object.entries(conditions).reduce<GroupedConditions>(
    (grouped, [key, value]) => {
      const index = key.lastIndexOf(delimiter);
      if (index <= 0) return grouped;
      const field = key.slice(0, index);
      const operation = key.slice(index + delimiter.length);
      return {
        ...grouped,
        [field]: { ...grouped[field], [operation]: value },
      };
    },
    {}
  );
}

function toFilterConditions({
  conditions,
}: {
  conditions: FlatConditions;
}): FilterCondition[] {
  const grouped = groupConditions({
    conditions,
    delimiter: CONDITION_KEY_DELIMITER,
  });
  return Object.entries(grouped).flatMap(([field, operations]) =>
    buildFieldConditions({ field, operations })
  );
}

async function buildFieldProps({
  auth,
  fieldId,
}: {
  auth: TwentyAuthValue;
  fieldId: string;
}): Promise<[string, InputProperty][]> {
  const field = await twentyApi.getField({ auth, fieldId });
  const target = twentyMetadataUtils.resolveFilterTarget({ field });
  if (!target) return [];

  const operatorOptions = buildFieldOperatorOptions({ field });
  const operatorProps: [string, InputProperty][] =
    operatorOptions.length === 0
      ? []
      : [
          [
            `${target.key}${CONDITION_KEY_DELIMITER}operator`,
            Property.StaticDropdown({
              displayName: `${target.label} operator`,
              description: 'How the value below is compared.',
              required: true,
              options: { options: operatorOptions },
            }),
          ],
        ];

  return [
    [
      `${target.key}${CONDITION_KEY_DELIMITER}header`,
      Property.MarkDown({
        value: `---\n\n### ${target.label} Filters`,
        variant: MarkdownVariant.BORDERLESS,
      }),
    ],
    ...operatorProps,
    ...buildValueProps({ field }),
  ];
}

function buildFieldOperatorOptions({
  field,
}: {
  field: TwentyMetadataField;
}): OperatorOption[] {
  return (OPERATORS_BY_TYPE[field.type] ?? TEXT_OPERATORS).map((operator) => ({
    label: OPERATORS[operator].label,
    description: OPERATORS[operator].description,
    value: operator,
  }));
}

function buildValueProps({
  field,
}: {
  field: TwentyMetadataField;
}): [string, InputProperty][] {
  const target = twentyMetadataUtils.resolveFilterTarget({ field });
  if (!target) return [];

  const subfields = twentyMetadataUtils.getCompositeSubfields({ field });
  if (subfields) {
    return subfields.map(
      ({ key, label, isNumber, placeholder, description }) => {
        const subfieldParams = {
          displayName: label,
          description,
          required: false,
          placeholder,
        };
        return [
          `${target.key}${CONDITION_KEY_DELIMITER}${key}`,
          isNumber
            ? Property.Number(subfieldParams)
            : Property.ShortText(subfieldParams),
        ];
      }
    );
  }

  const params = {
    displayName: 'Value',
    description: VALUE_DESCRIPTIONS[field.type] ?? TEXT_VALUE_DESCRIPTION,
    required: true,
  };
  const valueKey = `${target.key}${CONDITION_KEY_DELIMITER}value`;
  const options = twentyMetadataUtils.buildSelectOptions({ field });

  switch (field.type) {
    case 'NUMBER':
    case 'NUMERIC':
      return [[valueKey, Property.Number(params)]];
    case 'DATE':
    case 'DATE_TIME':
      return [
        [valueKey, Property.DateRange({ ...params, displayName: 'Range' })],
      ];
    case 'MULTI_SELECT':
      return [
        [
          valueKey,
          Property.StaticMultiSelectDropdown({
            ...params,
            options: { options },
          }),
        ],
      ];
    case 'SELECT':
    case 'RATING':
      return [
        [
          valueKey,
          Property.StaticDropdown({ ...params, options: { options } }),
        ],
      ];
    case 'BOOLEAN':
      return [[valueKey, Property.Checkbox(params)]];
    default:
      return [[valueKey, Property.ShortText(params)]];
  }
}

function buildFieldConditions({
  field,
  operations,
}: {
  field: string;
  operations: ConditionOperations;
}): FilterCondition[] {
  const { operator, header: _header, ...values } = operations;
  return Object.entries(values).flatMap(
    ([operation, value]): FilterCondition[] => {
      const path = operation === 'value' ? field : `${field}.${operation}`;
      if (isDateRangeValue(value)) {
        const { after, before } = dateRangeUtils.resolve(value);
        return [
          { field: path, operator: 'gte', value: after },
          { field: path, operator: 'lte', value: before },
        ];
      }
      if (!isFilterOperator(operator) || !isFilterValue(value)) return [];
      return [
        { field: path, operator, value: toListValue({ operator, value }) },
      ];
    }
  );
}

function toListValue({
  operator,
  value,
}: {
  operator: FilterOperator;
  value: FilterValue;
}): FilterValue {
  if (!LIST_OPERATORS.includes(operator) || typeof value !== 'string')
    return value;
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function isFilterOperator(value: unknown): value is FilterOperator {
  return typeof value === 'string' && value in OPERATORS;
}

function isFilterValue(value: unknown): value is FilterValue {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    (Array.isArray(value) && value.every((item) => typeof item === 'string'))
  );
}

function isDateRangeValue(value: unknown): value is DateRangeValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'preset' in value
  );
}

export const conditionUtils = {
  buildConditionProps,
  groupConditions,
  toFilterConditions,
};

export type FlatConditions = {
  [fieldDelimiterOperation: string]: unknown;
};

export type ConditionOperations = {
  operator?: unknown;
  header?: unknown;
  value?: unknown;
  [subfield: string]: unknown;
};

export type GroupedConditions = {
  [field: string]: ConditionOperations;
};

type OperatorDefinition = { label: string; description: string };

type OperatorOption = SelectOption & { description: string };
