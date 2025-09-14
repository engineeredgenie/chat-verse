import { Component } from '@angular/core';
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
  constructor(private appwrite: AppwriteService, private router: Router) {}

  async logout() {
    try {
      await this.appwrite.logout();
    } finally {
      await this.router.navigate(['/login']);
    }
  }
}


