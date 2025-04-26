import { Routes } from '@angular/router';
import {LoginComponent} from './auth/login/login.component';
import {ChatComponent} from './chat/chat.component';
import {VerifyAuthComponent} from './auth/verify-auth/verify-auth.component';

export const routes: Routes = [
  {
    path: '',
    component: ChatComponent,
  },
  {
    path: 'login',
    component: LoginComponent
  },
  {
    path: 'auth/verify',
    component: VerifyAuthComponent
  }
];
