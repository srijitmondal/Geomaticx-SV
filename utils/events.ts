import EventEmitter from 'eventemitter3';

export const eventEmitter = new EventEmitter();

export const EVENTS = {
  USER_LOGIN: 'USER_LOGIN',
  USER_LOGOUT: 'USER_LOGOUT',
  GALLERY_SYNC: 'GALLERY_SYNC',
} as const;