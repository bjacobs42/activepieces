import { createAction } from '@activepieces/pieces-framework';
import { twentyAuth } from '../auth';
import { twentyApi } from '../common/api';
import { conditionUtils } from '../common/conditions';
import { twentyCustomObjectProps } from '../common/custom-object-props';
import { twentyMetadataUtils } from '../common/metadata';

export const findCustomObject = createAction({
  auth: twentyAuth,
  name: 'findCustomObject',
  displayName: 'Find Custom Object',
  description: 'Finds custom object records in Twenty CRM.',
  classification: 'SEARCH',
  propertyGroups: [
    {
      key: 'search',
      display: 'section',
      label: 'Custom Object',
      icon: 'tag',
      props: ['customObject'],
    },
    {
      key: 'filters',
      display: 'section',
      label: 'Field',
      icon: 'tag',
      props: ['filterBy'],
    },
  ],
  props: {
    customObject: twentyCustomObjectProps.object({ required: true }),
    filterBy: twentyCustomObjectProps.filterBy({ required: true }),
    conditions: twentyCustomObjectProps.conditions({ required: false }),
  },
  async run(context) {
    const { customObject, conditions } = context.propsValue;
    if (!twentyMetadataUtils.isObjectRef(customObject))
      throw new Error('Select a custom object type.');

    return await twentyApi.findCustomObject({
      auth: context.auth,
      objectNamePlural: customObject.namePlural,
      conditions: conditionUtils.toFilterConditions({
        conditions: conditions ?? {},
      }),
    });
  },
});
