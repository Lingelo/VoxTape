import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  imports: [RouterModule],
  selector: 'sdn-root',
  template: '<router-outlet />',
  styles: [':host { display: block; height: 100vh; }'],
})
export class App {}
