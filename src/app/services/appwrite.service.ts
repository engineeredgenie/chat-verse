import { Injectable } from '@angular/core';
import { Client, Account, ID } from 'appwrite';

@Injectable({
  providedIn: 'root'
})
export class AppwriteService {
  client: Client;
  account: Account;

  constructor() {
    this.client = new Client();
    this.client
      .setEndpoint('https://fra.cloud.appwrite.io/v1')
      .setProject('680cb95e00346ae02841');

    this.account = new Account(this.client);
  }

  async createMagicLink(email: string, redirectUrl: string) {
    return await this.account.createMagicURLToken(ID.unique(), email, redirectUrl);
  }

  async createSession(userId: string, secret: string) {
    return await this.account.createSession(userId, secret);
  }

  async getUser() {
    return await this.account.get();
  }

  async logout() {
    return await this.account.deleteSession('current');
  }
}
