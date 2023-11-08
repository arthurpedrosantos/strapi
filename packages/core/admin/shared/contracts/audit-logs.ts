import { errors } from '@strapi/utils';
import { Entity, SanitizedAdminUser } from './shared';
import { Schema } from '@strapi/types';

interface CollectionAuditLog extends Schema.CollectionType {
  user?: SanitizedAdminUser;
}

interface SingleAuditLog extends Schema.SingleType {
  user?: SanitizedAdminUser;
}

type AuditLog = CollectionAuditLog | SingleAuditLog;

namespace GetAll {
  export interface Request {
    body: {};
    query: {};
  }

  export interface Response {
    data: AuditLog[];
    error?: errors.ApplicationError;
  }
}

namespace Get {
  export interface Request {
    body: {};
    query: {};
  }

  export interface Params {
    id: Entity['id'];
  }

  export interface Response {
    data: AuditLog;
    error?: errors.ApplicationError;
  }
}

export { AuditLog, GetAll, Get, SingleAuditLog, CollectionAuditLog };
