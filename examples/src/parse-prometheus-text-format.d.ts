declare module 'parse-prometheus-text-format' {

  export type Labels = {
    [k: string]: string
  }

  export type Gauge = {
    name: string,
    help: string,
    type: 'GAUGE',
    metrics: {
      value: string,
      labels: Labels
    }[]
  }

  export type Counter = {
    name: string,
    help: string,
    type: 'COUNTER',
    metrics: {
      value: string,
      labels?: Labels
    }[]
  }

  export type Untyped = {
    name: string,
    help: string,
    type: 'UNTYPED',
    metrics: {
      value: string,
      labels?: Labels
    }[]
  }

  export type Histogram = {
    name: string,
    help: string,
    type: 'HISTOGRAM',
    metrics: {
      value: string,
      labels?: Labels,
      quantiles: { [k: string]: string },
      count: string,
      sum: string
    }[]
  }

  export type Summary = {
    name: string,
    help: string,
    type: 'SUMMARY',
    metrics: {
      value: string,
      labels?: Labels,
      count: string,
      sum: string
    }[]
  }

  export type ParsedMetric = Gauge | Counter | Untyped | Histogram | Summary

  export default function parsePtf(data: string): ParsedMetric[];

}
