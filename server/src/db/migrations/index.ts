import { sql as initial } from './001_initial';

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

// Append new migrations here (next file: 002_<name>.ts). Never edit an applied one.
export const migrations: readonly Migration[] = [{ version: 1, name: 'initial', sql: initial }];
