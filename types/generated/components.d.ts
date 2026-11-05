import type { Schema, Struct } from '@strapi/strapi';

export interface TourExtraSection extends Struct.ComponentSchema {
  collectionName: 'components_tour_extra_sections';
  info: {
    displayName: 'extra-section';
    icon: 'file-alt';
  };
  attributes: {
    body: Schema.Attribute.Text;
    title: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

export interface TourFaqItem extends Struct.ComponentSchema {
  collectionName: 'components_tour_faq_items';
  info: {
    displayName: 'faq-item';
    icon: 'question';
  };
  attributes: {
    answer: Schema.Attribute.Text;
    order: Schema.Attribute.Integer;
    question: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

export interface TourItineraryDay extends Struct.ComponentSchema {
  collectionName: 'components_tour_itinerary_days';
  info: {
    displayName: 'itinerary-day';
    icon: 'calendar';
  };
  attributes: {
    altitudeText: Schema.Attribute.String;
    body: Schema.Attribute.Text;
    day: Schema.Attribute.String;
    dayLabel: Schema.Attribute.String;
    durationText: Schema.Attribute.String;
    order: Schema.Attribute.Integer;
    points: Schema.Attribute.JSON;
    title: Schema.Attribute.String;
  };
}

export interface TourListItem extends Struct.ComponentSchema {
  collectionName: 'components_tour_list_items';
  info: {
    displayName: 'list-item';
    icon: 'list';
  };
  attributes: {
    text: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

export interface TourSnapshotRow extends Struct.ComponentSchema {
  collectionName: 'components_tour_snapshot_rows';
  info: {
    displayName: 'snapshot-row';
    icon: 'table';
  };
  attributes: {
    label: Schema.Attribute.String & Schema.Attribute.Required;
    value: Schema.Attribute.Text;
  };
}

declare module '@strapi/strapi' {
  export namespace Public {
    export interface ComponentSchemas {
      'tour.extra-section': TourExtraSection;
      'tour.faq-item': TourFaqItem;
      'tour.itinerary-day': TourItineraryDay;
      'tour.list-item': TourListItem;
      'tour.snapshot-row': TourSnapshotRow;
    }
  }
}
