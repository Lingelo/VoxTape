import {
  Component,
  Input,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'sdn-glitch-loader',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="glitch-container">
      <span class="glitch-text" [class.cursor]="showCursor && isTyping">{{ displayText }}</span>
    </div>
  `,
  styles: [`
    .glitch-container {
      font-family: var(--font-pixel);
      font-size: 16px;
      color: var(--accent-primary);
      text-shadow:
        0 0 5px rgba(74, 222, 128, 0.8),
        0 0 10px rgba(74, 222, 128, 0.5);
      letter-spacing: 2px;
      min-height: 20px;
    }

    .glitch-text {
      &.cursor::after {
        content: '_';
        animation: blink 0.5s steps(2) infinite;
      }
    }

    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0; }
    }
  `],
})
export class GlitchLoaderComponent implements OnInit, OnDestroy {
  @Input() messages: string[] = [
    'TRAITEMENT...',
    'ANALYSE...',
    'DECODAGE...',
    'CALCUL...',
  ];
  @Input() typingSpeed = 50;
  @Input() glitchInterval = 100; // How often to glitch during glitch phase
  @Input() glitchDuration = 2000; // How long to glitch before erasing
  @Input() showCursor = true;

  displayText = '';
  isTyping = true;

  private readonly cdr = inject(ChangeDetectorRef);
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private currentMessageIndex = 0;
  private currentCharIndex = 0;
  private originalText = '';
  private glitchChars = '0123456789@#$%&*!?<>[]{}';

  ngOnInit(): void {
    this.startTyping();
  }

  ngOnDestroy(): void {
    this.clearTimers();
  }

  private clearTimers(): void {
    if (this.intervalId) clearInterval(this.intervalId);
    if (this.timeoutId) clearTimeout(this.timeoutId);
  }

  private startTyping(): void {
    this.isTyping = true;
    const currentMessage = this.messages[this.currentMessageIndex];
    this.originalText = currentMessage;

    this.intervalId = setInterval(() => {
      if (this.currentCharIndex < currentMessage.length) {
        const char = currentMessage[this.currentCharIndex];

        // 30% chance to glitch during typing
        if (Math.random() < 0.3 && /[a-zA-Z]/.test(char)) {
          // Show glitch char first
          const glitchChar = this.glitchChars[Math.floor(Math.random() * this.glitchChars.length)];
          this.displayText += glitchChar;
          this.cdr.markForCheck();

          // Then correct it after short delay
          setTimeout(() => {
            this.displayText = this.displayText.slice(0, -1) + char;
            this.cdr.markForCheck();
          }, 60);
        } else {
          this.displayText += char;
          this.cdr.markForCheck();
        }

        // Also randomly glitch already-typed letters
        if (this.displayText.length > 2 && Math.random() < 0.2) {
          this.glitchExistingChar();
        }

        this.currentCharIndex++;
      } else {
        // Finished typing, start glitching
        this.clearTimers();
        this.isTyping = false;
        this.cdr.markForCheck();
        this.startGlitching();
      }
    }, this.typingSpeed);
  }

  private glitchExistingChar(): void {
    const textArray = this.displayText.split('');
    const pos = Math.floor(Math.random() * (textArray.length - 1)); // Don't glitch last char being typed
    const originalChar = this.originalText[pos];

    if (originalChar && /[a-zA-Z]/.test(originalChar)) {
      const glitchChar = this.glitchChars[Math.floor(Math.random() * this.glitchChars.length)];
      textArray[pos] = glitchChar;
      this.displayText = textArray.join('');
      this.cdr.markForCheck();

      // Restore
      setTimeout(() => {
        const restored = this.displayText.split('');
        if (restored[pos]) {
          restored[pos] = originalChar;
          this.displayText = restored.join('');
          this.cdr.markForCheck();
        }
      }, 40);
    }
  }

  private startGlitching(): void {
    // Glitch random characters periodically
    this.intervalId = setInterval(() => {
      this.applyRandomGlitch();
    }, this.glitchInterval);

    // After glitch duration, erase and move to next message
    this.timeoutId = setTimeout(() => {
      this.clearTimers();
      this.startErasing();
    }, this.glitchDuration);
  }

  private applyRandomGlitch(): void {
    const textArray = this.originalText.split('');
    const numGlitches = Math.floor(Math.random() * 3) + 1; // 1-3 glitches

    for (let i = 0; i < numGlitches; i++) {
      const pos = Math.floor(Math.random() * textArray.length);
      const char = textArray[pos];

      // Only glitch letters, not dots or spaces
      if (/[a-zA-Z]/.test(char)) {
        const glitchChar = this.glitchChars[Math.floor(Math.random() * this.glitchChars.length)];
        textArray[pos] = glitchChar;
      }
    }

    this.displayText = textArray.join('');
    this.cdr.markForCheck();

    // Restore after short delay
    setTimeout(() => {
      this.displayText = this.originalText;
      this.cdr.markForCheck();
    }, 50);
  }

  private startErasing(): void {
    this.intervalId = setInterval(() => {
      if (this.displayText.length > 0) {
        this.displayText = this.displayText.slice(0, -1);
        this.cdr.markForCheck();
      } else {
        // Move to next message
        this.clearTimers();
        this.currentMessageIndex = (this.currentMessageIndex + 1) % this.messages.length;
        this.currentCharIndex = 0;

        this.timeoutId = setTimeout(() => {
          this.startTyping();
        }, 300);
      }
    }, 25);
  }
}
