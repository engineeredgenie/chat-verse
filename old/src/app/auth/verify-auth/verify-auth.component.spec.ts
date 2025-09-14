import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VerifyAuthComponent } from './verify-auth.component';

describe('VerifyAuthComponent', () => {
  let component: VerifyAuthComponent;
  let fixture: ComponentFixture<VerifyAuthComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VerifyAuthComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(VerifyAuthComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
