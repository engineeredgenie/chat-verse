import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { inject } from '@angular/core';
import { AppwriteService } from '../services/appwrite.service';

// Blocks access to public routes if already authenticated
export const guestGuard: CanActivateFn = async (): Promise<boolean | UrlTree> => {
  const appwrite = inject(AppwriteService);
  const router = inject(Router);
  try {
    await appwrite.getUser();
    return router.parseUrl('/');
  } catch (e) {
    return true;
  }
};


