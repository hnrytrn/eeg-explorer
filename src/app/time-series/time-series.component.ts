import { Component, ElementRef, Input, AfterViewInit } from '@angular/core';
import { OnInit, OnDestroy } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { SmoothieChart, TimeSeries } from 'smoothie';
import { channelNames, EEGSample } from 'muse-js';
import { groupBy, filter, mergeMap, takeUntil, map, tap } from 'rxjs/operators';
import { epoch, fft, addInfo, powerByBand, bandpassFilter } from '@neurosity/pipes';

import { ChartService } from '../shared/services/chart.service';
import { EegStreamService } from '../shared/services/eeg-stream.service';

const samplingFrequency = 256;

@Component({
  selector: 'app-time-series',
  templateUrl: 'time-series.component.html',
  styleUrls: ['time-series.component.css'],
})
export class TimeSeriesComponent implements OnInit, OnDestroy, AfterViewInit {

  get data(): Observable<EEGSample> {
    return this.eegStream.data;
  }

  filter = false;

  channels = 4;
  canvases: SmoothieChart[];

  powers: any;

  readonly destroy = new Subject<void>();
  readonly channelNames = channelNames;
  readonly amplitudes = [];
  readonly uVrms = [0, 0, 0, 0, 0];
  readonly uMeans = [0, 0, 0, 0, 0];

  readonly options = this.chartService.getChartSmoothieDefaults({
    millisPerPixel: 8,
    maxValue: 500,
    minValue: -500
  });
  readonly colors = this.chartService.getColors();

  private lines: TimeSeries[];

  constructor(private view: ElementRef, private chartService: ChartService, private eegStream: EegStreamService) {
  }

  get amplitudeScale() {
    return this.canvases[0].options.maxValue;
  }

  set amplitudeScale(value: number) {
    for (const canvas of this.canvases) {
      canvas.options.maxValue = value;
      canvas.options.minValue = -value;
    }
  }

  get timeScale() {
    return this.canvases[0].options.millisPerPixel;
  }

  set timeScale(value: number) {
    for (const canvas of this.canvases) {
      canvas.options.millisPerPixel = value;
    }
  }

  ngOnInit() {
    this.canvases = Array(this.channels).fill(0).map(() => new SmoothieChart(this.options));
    this.lines = Array(this.channels).fill(0).map(() => new TimeSeries());
    this.addTimeSeries();

    this.data.pipe(
      takeUntil(this.destroy),
      bandpassFilter({ cutoffFrequencies: [1, 30], nbChannels: 4, samplingRate: samplingFrequency }),
      mergeMap((sampleSet: EEGSample) =>
        sampleSet.data.slice(0, this.channels).map((value, electrode) => ({
          timestamp: sampleSet.timestamp, value, electrode
        }))),
      groupBy(sample => sample.electrode),
      mergeMap(group => {
        return group.pipe(
          filter(sample => !isNaN(sample.value))
        );
      }),
    ).subscribe(sample => {
        this.draw(sample.timestamp, sample.value, sample.electrode);
      }, error => console.log('error:', error));

    // filtered.pipe(
    //   epoch({ duration: 256, interval: 100 }),
    //   addInfo({ samplingRate: samplingFrequency, channelNames: channelNames }),
    //   fft({ bins: 256 }),
    //   powerByBand()
    // ).subscribe(powers => {
    //   this.powers = powers;
    // }, (error) => console.log('error', error));
  }

  ngAfterViewInit() {
    const channels = this.view.nativeElement.querySelectorAll('canvas');
    this.canvases.forEach((canvas, index) => {
      canvas.streamTo(channels[index]);
    });
  }

  ngOnDestroy() {
    this.destroy.next();
  }

  addTimeSeries() {
    this.lines.forEach((line, index) => {
      this.canvases[index].addTimeSeries(line, {
        lineWidth: 2,
        strokeStyle: this.colors[index].borderColor
      });
    });
  }

  draw(timestamp: number, amplitude: number, index: number) {
    this.uMeans[index] = 0.995 * this.uMeans[index] + 0.005 * amplitude;
    this.uVrms[index] = Math.sqrt(0.995 * this.uVrms[index] ** 2 + 0.005 * (amplitude - this.uMeans[index]) ** 2);

    this.lines[index].append(timestamp, amplitude);
    this.amplitudes[index] = amplitude.toFixed(2);
  }
}
