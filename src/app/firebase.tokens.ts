import { InjectionToken } from '@angular/core';
import { Auth } from 'firebase/auth';
import { Firestore } from 'firebase/firestore';

export const AUTH = new InjectionToken<Auth>('Firebase Auth');
export const FIRESTORE = new InjectionToken<Firestore>('Firebase Firestore');
