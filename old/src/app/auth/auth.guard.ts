import { CanActivateFn, Router } from '@angular/router';
import {inject} from '@angular/core';
import {AppwriteService} from '../services/appwrite.service';

export const authGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const appWrite = inject(AppwriteService);

  try {
    const r = await appWrite.getUser(); // if succeeds, user is logged in
    return true;
  } catch (error) {
    // user not logged in or session expired
    await router.navigate(['/login']);
    return false;
  }
};
