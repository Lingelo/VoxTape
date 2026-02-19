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
      margin-bottom: 12px;
    }

    .position-bottom {
      top: 100%;
      left: 50%;
      transform: translateX(-50%);
      margin-top: 12px;
    }

    .position-left {
      right: 100%;
      top: 50%;
      transform: translateY(-50%);
      margin-right: 12px;
    }

    .position-right {
      left: 100%;
      top: 50%;
      transform: translateY(-50%);
      margin-left: 12px;
    }

    .tooltip {
      pointer-events: auto;
      background: var(--bg-surface);
      border: 1px solid var(--accent-primary);
      border-radius: var(--radius-sm);
      padding: var(--space-3);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(74, 222, 128, 0.2);
      min-width: 220px;
      max-width: 280px;
      animation: tooltipIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .tooltip-arrow {
      position: absolute;
      width: 12px;
      height: 12px;
      background: var(--bg-surface);
      border: 1px solid var(--accent-primary);
      transform: rotate(45deg);
    }

    .position-top .tooltip-arrow {
      bottom: -7px;
      left: 50%;
      margin-left: -6px;
      border-top: none;
      border-left: none;
    }

    .position-bottom .tooltip-arrow {
      top: -7px;
      left: 50%;
      margin-left: -6px;
      border-bottom: none;
      border-right: none;
    }

    .position-left .tooltip-arrow {
      right: -7px;
      top: 50%;
      margin-top: -6px;
      border-left: none;
      border-bottom: none;
    }

    .position-right .tooltip-arrow {
      left: -7px;
      top: 50%;
      margin-top: -6px;
      border-right: none;
      border-top: none;
    }

    .tooltip-content {
      position: relative;
    }

    .tooltip-text {
      margin: 0 0 var(--space-3);
      font-size: 13px;
      line-height: 1.5;
      color: var(--text-primary);
    }

    .tooltip-actions {
      display: flex;
      gap: var(--space-2);
      justify-content: flex-end;
    }

    .skip-btn, .next-btn {
      padding: var(--space-1) var(--space-3);
      border-radius: var(--radius-sm);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
    }

    .skip-btn {
      background: transparent;
      border: 1px solid var(--border-subtle);
      color: var(--text-secondary);

      &:hover {
        background: var(--accent-hover);
        color: var(--text-primary);
      }
    }

    .next-btn {
      background: var(--accent-primary);
      border: none;
      color: #1a1a1a;

      &:hover {
        filter: brightness(1.1);
      }
    }

    .tooltip-progress {
      display: flex;
      justify-content: center;
      gap: var(--space-1);
      margin-top: var(--space-3);
      padding-top: var(--space-2);
      border-top: 1px solid var(--border-subtle);
    }

    .dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--border-subtle);
      transition: background 0.2s;

      &.active {
        background: var(--accent-primary);
      }
    }

    @keyframes tooltipIn {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
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
