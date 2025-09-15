import { Component, EventEmitter, Output } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AppwriteService } from '../services/appwrite.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})
export class HeaderComponent {
  userId: string | null = null;
  @Output() manageFriends = new EventEmitter<void>();

  constructor(private appwrite: AppwriteService, private router: Router) {
    this.loadUserId();
  }

  private async loadUserId() {
    try {
      const me = await this.appwrite.getUser();
      this.userId = (me as any)?.prefs?.userId || null;
    } catch {
      this.userId = null;
    }
  }

  triggerManageFriends() {
    this.manageFriends.emit();
  }

  async logout() {
    try {
      await this.appwrite.logout();
    } finally {
      await this.router.navigate(['/login']);
    }
  }
}


