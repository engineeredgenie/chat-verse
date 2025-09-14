import { Component } from '@angular/core';
import {AppwriteService} from '../../services/appwrite.service';
import {FormsModule} from '@angular/forms';
import { environment as env } from '../../../environments/environment.development';
import {NgClass} from '@angular/common';

@Component({
  selector: 'app-login',
  imports: [
    FormsModule,
    NgClass
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  isSigningIn: boolean = false;
  magicLinkSent: boolean = false;
  email: string = 'engineeredgenie@gmail.com';
  signInBtnLabel: string = 'SIGN IN';

  constructor(private appWrite: AppwriteService) {

  }

  signIn(): void {
    this.isSigningIn = true;
    this.appWrite.createMagicLink(this.email, env.authRedirectUrl).then((res: any) => {
      console.log(res)
      this.magicLinkSent = true;
      this.signInBtnLabel = 'EMAIL SENT';
      this.isSigningIn = false;
    }, (err: any) => {
      console.log(err)
      this.isSigningIn = false;
    })
  }
}
