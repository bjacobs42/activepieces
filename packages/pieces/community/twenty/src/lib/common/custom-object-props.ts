import { Property } from '@activepieces/pieces-framework';
import { twentyAuth } from '../auth';
import { PropParams } from './ai-props';
import { conditionUtils } from './conditions';
import { twentyMetadataUtils } from './metadata';

function object<R extends boolean>({
  required,
  displayName = 'Custom Object Type',
  description = 'The type of record to search, e.g. People, Companies or one of your custom objects.',
}: PropParams<R>) {
  return Property.Dropdown({
    auth: twentyAuth,
    displayName,
    description,
    required,
    refreshers: ['auth'],
    options: async ({ auth }) => {
      if (!auth)
        return {
          disabled: true,
          options: [],
          placeholder: 'Connect your Twenty CRM.',
        };

      return { options: await twentyMetadataUtils.objectOptions({ auth }) };
    },
  });
}

function filterBy<R extends boolean>({
  required,
  displayName = 'Filter By',
  description = 'The fields to filter on.',
}: PropParams<R>) {
  return Property.MultiSelectDropdown({
    auth: twentyAuth,
    displayName,
    description,
    required,
    refreshers: ['customObject'],
    options: async ({ auth, customObject }) => {
      if (!auth || !twentyMetadataUtils.isObjectRef(customObject))
        return {
          disabled: true,
          options: [],
          placeholder: 'Select an Object Type.',
        };

      return {
        options: await twentyMetadataUtils.fieldOptions({
          auth,
          objectId: customObject.id,
        }),
      };
    },
  });
}

function conditions<R extends boolean>({
  required,
  displayName = 'Filter definitions',
  description = 'Set how each field is compared. Records must match every filter.',
}: PropParams<R>) {
  return Property.DynamicProperties({
    auth: twentyAuth,
    displayName,
    description,
    required,
    refreshers: ['filterBy', 'customObject'],
    props: async ({ auth, filterBy }) => {
      if (!auth || !Array.isArray(filterBy)) return {};

      return await conditionUtils.buildConditionProps({ auth, filterBy });
    },
  });
}

export const twentyCustomObjectProps = {
  object,
  filterBy,
  conditions,
};
