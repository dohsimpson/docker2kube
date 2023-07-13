import convert from '../src/index'
import { stringify } from 'yaml';

describe('convert', () => {
  it('should work', () => {
    const yaml = `
    services:
      frontend:
        labels:
          - "com.example.description=Accounting webapp"
          - "com.example.department=Finance"
          - "com.example.label-with-empty-value"
        image: awesome/webapp
        ports:
          - "443:8043"
        expose:
          - "3000"
        hostname: my-frontend
        networks:
          - front-tier
          - back-tier
        configs:
          - httpd-config
        secrets:
          - server-certificate
        command: echo hello world
        deploy:
          replicas: 3
          resources:
            limits:
              cpus: '0.001'
              memory: 50M
            reservations:
              cpus: '0.0001'
              memory: 20M
          restart_policy:
            condition: on-failure
            delay: 5s
            max_attempts: 3
            window: 120s
          placement:
            constraints:
              - node.role == manager
              - engine.labels.operatingsystem == ubuntu 14.04
        environment:
          RACK_ENV: development
          SHOW: "true"
          USER_INPUT:
        cap_add:
          - ALL
        tmpfs:
          - /tmp
          - /run
        stop_grace_period: 1m30s
        healthcheck:
          test: ["CMD", "curl", "-f", "http://localhost:8080"]
          interval: 30s
          timeout: 10s
          retries: 3

      backend:
        container_name: my-backend
        image: awesome/database
        volumes:
          - db-data:/etc/data
        networks:
          - back-tier
        environment:
          - RACK_ENV=development
          - SHOW=true
          - USER_INPUT
        configs:
          - source: httpd-config
            target: /etc/apache2/httpd.conf
            uid: '1000'
            gid: '1000'
            mode: 0440

    volumes:
      db-data:
        driver: flocker
        driver_opts:
          size: "10GiB"

    configs:
      httpd-config:
        file: ./httpd.conf

    secrets:
      server-certificate:
        external: true

    networks:
      # The presence of these objects is sufficient to define them
      front-tier: {}
      back-tier: {}
    `
    const result = convert(yaml);
    expect(result).toMatchSnapshot();
  });
})
