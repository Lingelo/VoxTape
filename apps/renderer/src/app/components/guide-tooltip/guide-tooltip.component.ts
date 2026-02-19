import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

@Component({
  selector: 'sdn-guide-tooltip',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible) {
      <div class="tooltip-container" [class]="'position-' + position">
        <div class="tooltip" role="tooltip">
          <div class="tooltip-arrow"></div>
          <div class="tooltip-content">
            <p class="tooltip-text">{{ text }}</p>
            <div class="tooltip-actions">
              <button class="skip-btn" (click)="skip.emit()">Passer</button>
              <button class="next-btn" (click)="next.emit()">
                {{ isLast ? 'Terminer' : 'Suivant' }}
              </button>
            </div>
          </div>
          <div class="tooltip-progress">
            <span class="dot" [class.active]="step >= 1"></span>
            <span class="dot" [class.active]="step >= 2"></span>
            <span class="dot" [class.active]="step >= 3"></span>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .tooltip-container {
      position: absolute;
      z-index: 1000;
      pointer-events: none;
    }

    .position-top {
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%);
      margin-bottom: 16px;
    }

    .position-bottom {
      top: 100%;
      left: 50%;
      transform: translateX(-50%);
      margin-top: 16px;
    }

    .position-left {
      right: 100%;
      top: 50%;
      transform: translateY(-50%);
      margin-right: 16px;
    }

    .position-right {
      left: 100%;
      top: 50%;
      transform: translateY(-50%);
      margin-left: 16px;
    }

    .tooltip {
      pointer-events: auto;
      background: var(--bg-pill);
      border: 3px solid;
      border-color: var(--bevel-light) var(--bevel-dark) var(--bevel-dark) var(--bevel-light);
      border-radius: 0;
      padding: var(--space-3);
      box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.5);
      min-width: 240px;
      max-width: 300px;
      animation: tooltipIn 0.2s steps(4);
    }

    .tooltip-arrow {
      display: none;
    }

    .tooltip-content {
      position: relative;
    }

    .tooltip-text {
      margin: 0 0 var(--space-3);
      font-family: var(--font-pixel);
      font-size: 18px;
      line-height: 1.4;
      color: var(--accent-primary);
      text-shadow:
        0 0 5px rgba(74, 222, 128, 0.6),
        0 0 10px rgba(74, 222, 128, 0.3);
    }

    .tooltip-actions {
      display: flex;
      gap: var(--space-2);
      justify-content: flex-end;
    }

    .skip-btn, .next-btn {
      padding: var(--space-2) var(--space-3);
      border-radius: 0;
      font-family: var(--font-pixel);
      font-size: 16px;
      font-weight: 400;
      cursor: pointer;
      transition: all 0.1s;
      border: 3px solid;
      text-transform: uppercase;
    }

    .skip-btn {
      background: var(--bg-surface);
      border-color: var(--bevel-light) var(--bevel-dark) var(--bevel-dark) var(--bevel-light);
      color: var(--text-secondary);

      &:hover {
        background: var(--accent-hover);
        color: var(--text-primary);
      }

      &:active {
        border-color: var(--bevel-dark) var(--bevel-light) var(--bevel-light) var(--bevel-dark);
      }
    }

    .next-btn {
      background: var(--accent-primary);
      border-color: #6fe8a8 #1a5c34 #1a5c34 #6fe8a8;
      color: #1a1a1a;
      box-shadow: 0 0 10px rgba(74, 222, 128, 0.4);

      &:hover {
        filter: brightness(1.1);
        box-shadow: 0 0 15px rgba(74, 222, 128, 0.6);
      }

      &:active {
        border-color: #1a5c34 #6fe8a8 #6fe8a8 #1a5c34;
      }
    }

    .tooltip-progress {
      display: flex;
      justify-content: center;
      gap: 6px;
      margin-top: var(--space-3);
      padding-top: var(--space-2);
      border-top: 2px solid var(--bevel-dark);
    }

    .dot {
      width: 8px;
      height: 8px;
      border-radius: 0;
      background: #333;
      transition: background 0.1s, box-shadow 0.1s;

      &.active {
        background: var(--accent-primary);
        box-shadow: 0 0 6px rgba(74, 222, 128, 0.8);
      }
    }

    @keyframes tooltipIn {
      0% {
        opacity: 0;
        transform: scale(0.9);
      }
      50% {
        opacity: 0.5;
      }
      100% {
        opacity: 1;
        transform: scale(1);
      }
    }
  `]
})
export class GuideTooltipComponent {
  @Input() visible = false;
  @Input() text = '';
  @Input() position: TooltipPosition = 'top';
  @Input() step = 1;
  @Input() isLast = false;

  @Output() next = new EventEmitter<void>();
  @Output() skip = new EventEmitter<void>();
}
