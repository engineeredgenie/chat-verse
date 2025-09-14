import {AfterViewInit, ChangeDetectorRef, Component, ElementRef, Input, ViewChild} from '@angular/core';
import WaveSurfer from 'wavesurfer.js';
import {MessageInterface} from '../interfaces';
import {NgClass} from '@angular/common';

@Component({
  selector: 'app-audio-player',
  imports: [
    NgClass
  ],
  templateUrl: './audio-player.component.html',
  styleUrl: './audio-player.component.scss'
})
export class AudioPlayerComponent implements AfterViewInit {
  @Input() data!: MessageInterface;
  @ViewChild('waveform') waveformRef!: ElementRef;
  wavesurfer!: WaveSurfer;
  audioStatus: 'playing' | 'paused' | 'finished' = 'finished';
  audioLength: string = '';

  constructor(private cdr: ChangeDetectorRef) {
  }

  ngAfterViewInit(): void {

    this.wavesurfer = WaveSurfer.create({
      container: this.waveformRef.nativeElement,
      waveColor: '#ffffff', // subtle transparent white for background wave
      progressColor: this.createBarGradient(this.data.isSentByMe), // gradient bars for progress
      barWidth: 5,
      barGap: 2,
      barRadius: 2,
      height: 24,
      width: '100%',
      normalize: true,
      cursorColor: 'transparent',
    });
    this.wavesurfer.load(this.data.data);

    this.wavesurfer.on('play', () => {
      this.audioStatus = 'playing';
    });

    this.wavesurfer.on('pause', () => {
      this.audioStatus = 'paused';
    });

    this.wavesurfer.on('finish', () => {
      this.audioStatus = 'finished';
    });

    this.wavesurfer.on('audioprocess', (timestamp) => {
      console.log(timestamp)
      this.audioLength = this.formatTime(timestamp);
      this.cdr.detectChanges();
    });

    this.wavesurfer.on('decode', (length) => {
      this.audioLength = this.formatTime(length);
      this.cdr.detectChanges();
    });
  }

  createBarGradient(isSentByMe: boolean): CanvasGradient | string {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    let gradient: CanvasGradient;

    if (ctx) {
      gradient = ctx.createLinearGradient(0, 0, 512, 0);
      console.log('sent by me', isSentByMe);
      if (!isSentByMe) {
        gradient.addColorStop(0.0, '#007BFF');
        gradient.addColorStop(0.25, '#bb53ff');
        gradient.addColorStop(0.5, '#9803af');
        gradient.addColorStop(0.75, '#e74c3c');
        gradient.addColorStop(0.9, 'rgb(185,34,17)');
        gradient.addColorStop(0.1, 'rgb(185,34,17)');
      } else {
        gradient.addColorStop(0.0, '#00FFFF');
        gradient.addColorStop(0.3, '#0ff573');
        gradient.addColorStop(0.4, '#FFFF33');
        gradient.addColorStop(0.75, '#FFA500');
        gradient.addColorStop(0.1, '#f45d0b');
      }
      return gradient;
    }

    return '#ffffff';
  }

  playAudio() {
    this.wavesurfer.playPause();
  }

  formatTime(seconds: number): string {
    // Handle edge cases
    if (isNaN(seconds) || seconds < 0) return "00:00";

    // Round to nearest whole second
    const totalSeconds = Math.round(seconds);

    // Calculate minutes and seconds
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;

    // Format with leading zeros
    const formattedMins = mins.toString().padStart(2, '0');
    const formattedSecs = secs.toString().padStart(2, '0');

    // Return in appropriate format
    if (mins > 0) {
      return `${formattedMins}:${formattedSecs}`;
    } else {
      return `00:${formattedSecs}`;
    }
  }
}
