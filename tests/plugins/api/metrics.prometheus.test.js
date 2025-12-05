import { MetricsCollector } from '../../../src/plugins/api/concerns/metrics-collector.js';

describe('MetricsCollector - Prometheus output', () => {
  it('renders key metrics in OpenMetrics format', () => {
    const collector = new MetricsCollector({
      enabled: true,
      format: 'prometheus',
      resetInterval: 0
    });

    collector.recordRequest({ method: 'GET', path: '/v1/users', status: 200, duration: 12 });
    collector.recordAuth({ success: true, method: 'basic' });
    collector.recordResourceOperation({ action: 'created', resource: 'users' });
    collector.recordUserEvent({ action: 'login' });
    collector.recordError({ error: new Error('boom'), type: 'test' });

    const body = collector.getPrometheusMetrics();

    expect(body).toContain('s3db_requests_total 1');
    expect(body).toContain('s3db_requests_method_total{method="GET"} 1');
    expect(body).toContain('s3db_auth_events_total{result="success"} 1');
    expect(body).toContain('s3db_resource_operations_total{action="created"} 1');
    expect(body).toContain('s3db_errors_total 1');
  });
});
