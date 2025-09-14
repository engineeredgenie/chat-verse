import {AfterViewInit, Component} from '@angular/core';
import {AppwriteService} from '../../services/appwrite.service';
import {Router} from '@angular/router';

@Component({
  selector: 'app-logout',
  imports: [],
  templateUrl: './logout.component.html',
  styleUrl: './logout.component.scss'
})
export class LogoutComponent implements AfterViewInit {
  constructor(private appWrite: AppwriteService, private router: Router) {
  }

  ngAfterViewInit(): void {
    this.appWrite.logout().then(() => {
      this.router.navigate(['/login']);
    }).catch(error => {
      alert('Unable to logout');
    })
  }
}
