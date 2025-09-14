import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { inject } from '@angular/core';
import { AppwriteService } from '../services/appwrite.service';

export const authGuard: CanActivateFn = async (): Promise<boolean | UrlTree> => {
  const appwrite = inject(AppwriteService);
  const router = inject(Router);
  try {
    await appwrite.getUser();
    return true;
  } catch (e) {
    return router.parseUrl('/login');
  }
};


