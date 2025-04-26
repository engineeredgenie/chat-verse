import { Component, OnInit } from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {AppwriteService} from '../../services/appwrite.service';
import {log} from '@angular-devkit/build-angular/src/builders/ssr-dev-server';

@Component({
  selector: 'app-verify-auth',
  imports: [],
  templateUrl: './verify-auth.component.html',
  styleUrl: './verify-auth.component.scss'
})
export class VerifyAuthComponent implements OnInit {
  constructor(private route: ActivatedRoute, private router: Router, private appWrite: AppwriteService) {
  }

  ngOnInit() {
    const userId = this.route.snapshot.queryParamMap.get('userId')!;
    const secret = this.route.snapshot.queryParamMap.get('secret')!;

    this.appWrite.createSession(userId, secret).then(() => {
      this.router.navigate(['/']);
    });
  }
}
