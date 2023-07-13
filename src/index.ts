import { parse, stringify } from 'yaml'

import { Iok8SApiAppsV1Deployment, Iok8SApiCoreV1Capabilities, Iok8SApiCoreV1Container, Iok8SApiCoreV1ContainerPort, Iok8SApiCoreV1EnvVar, Iok8SApiCoreV1ExecAction, Iok8SApiCoreV1PodSecurityContext, Iok8SApiCoreV1Probe, Iok8SApiCoreV1ResourceRequirements, Iok8SApiCoreV1SecurityContext, Iok8SApiCoreV1Service, Iok8SApiCoreV1ServicePort, Iok8SApiCoreV1ServiceSpec, Iok8SApiCoreV1Volume, Iok8SApiCoreV1VolumeMount, Iok8SApimachineryPkgApisMetaV1ObjectMeta3, KubeSpec } from './kubeTypes'
import { ComposeSpecification } from './composeTypes'

import { fail, convertDurationToNumber, convertName, generateRandomString, parseCommand } from './helpers'

export function convert(yaml: string): string {
  interface D2KConfig {
    namespace?: string;
  }

  const config: D2KConfig = { namespace: 'default' };

  const obj = parse(yaml)

  const composeObj: ComposeSpecification = obj as ComposeSpecification;

  const kubeSpecList: KubeSpec[] = [] as KubeSpec[];

  // build compose service
  for (let name in composeObj.services) {
    const kubeDeployObj: Iok8SApiAppsV1Deployment = {} as Iok8SApiAppsV1Deployment;
    kubeDeployObj.apiVersion = 'apps/v1';
    kubeDeployObj.kind = 'Deployment';

    const service = composeObj.services[name];
    name = service.container_name || name; // use container_name as name if it exists


    // deployment.metadata
    kubeDeployObj.metadata = kubeDeployObj.metadata || {};
    kubeDeployObj.metadata.name = name;
    kubeDeployObj.metadata.namespace = config.namespace;
    kubeDeployObj.metadata.labels = kubeDeployObj.metadata.labels || {};
    kubeDeployObj.metadata.labels.app = name;
    kubeDeployObj.metadata.annotations = kubeDeployObj.metadata.annotations || {};
    if (service.labels) {
      if (Array.isArray(service.labels)) {
        for (const label of service.labels) {
          const [key, value] = label.split('=');
          kubeDeployObj.metadata.annotations[key] = value || '';
        }
      } else {
        for (const key in service.labels) {
          kubeDeployObj.metadata.annotations[key] = service.labels[key]?.toString() || '';
        }
      }
    }


    // deployment.spec
    kubeDeployObj.spec = kubeDeployObj.spec || {selector: {}, template: {}};

    // deployment.spec.replicas
    kubeDeployObj.spec.replicas = service.deploy?.replicas || 1;

    // deployment.spec.selector
    kubeDeployObj.spec.selector.matchLabels = kubeDeployObj.spec.selector.matchLabels || {};
    kubeDeployObj.spec.selector.matchLabels.app = name;

    // deployment.spec.template
    kubeDeployObj.spec.template.metadata = kubeDeployObj.spec.template.metadata || {};
    kubeDeployObj.spec.template.metadata.labels = kubeDeployObj.spec.template.metadata.labels || {};
    kubeDeployObj.spec.template.metadata.labels.app = name;

    // deployment.spec.template.spec
    kubeDeployObj.spec.template.spec = kubeDeployObj.spec.template.spec || {containers: []};

    // deployment.spec.template.spec.hostname
    kubeDeployObj.spec.template.spec.hostname = service.hostname;

    // deployment.spec.template.spec.hostPID
    if (service.pid) {
      kubeDeployObj.spec.template.spec.hostPID = service.pid === 'host';
    }

    // deployment.spec.template.spec.terminateGracePeriodSeconds
    if (service.stop_grace_period) {
      kubeDeployObj.spec.template.spec.terminationGracePeriodSeconds = convertDurationToNumber(service.stop_grace_period);
    }

    // deployment.spec.template.spec.containers
    const container: Iok8SApiCoreV1Container = {} as Iok8SApiCoreV1Container;
    container.name = name;
    container.image = service.image || 'PLACEHOLDER';
    container.command = typeof service.command === 'string' ? 
      parseCommand(service.command) : 
      service.command === null ? undefined : service.command;
    container.entrypoint = typeof service.entrypoint === 'string' ?
      service.entrypoint.split(/\s+/) :
      service.entrypoint === null ? undefined : service.entrypoint;

    // deployment.spec.template.spec.volumes and deployment.spec.template.spec.containers.volumeMounts
    if (service.volumes) {
      kubeDeployObj.spec.template.spec.volumes = [];
      for (let volume of service.volumes) {
        const kubeVolume: Iok8SApiCoreV1Volume = {} as Iok8SApiCoreV1Volume;
        if (typeof volume === 'string') {
          // short syntax: NAME:PATH[:MODE]
          const [name, path, mode] = volume.split(':');
          kubeVolume.name = convertName(name) || generateRandomString();
          // TODO supports other types of volumes
          kubeVolume.emptyDir = {};

          container.volumeMounts = container.volumeMounts || [];
          const kubeVolumeMount: Iok8SApiCoreV1VolumeMount = {} as Iok8SApiCoreV1VolumeMount;
          kubeVolumeMount.name = kubeVolume.name;
          kubeVolumeMount.mountPath = path || name;

          if (mode) {
            kubeVolumeMount.readOnly = mode === 'ro';
          }
          container.volumeMounts.push(kubeVolumeMount);
        } else if (typeof volume === 'object') {
          // long syntax
          if (volume.type === 'volume' && volume.source && volume.target) {
            kubeVolume.name = convertName(volume.source);
            // TODO supports other types of volumes
            kubeVolume.emptyDir = {};

            container.volumeMounts = container.volumeMounts || [];
            const kubeVolumeMount: Iok8SApiCoreV1VolumeMount = {} as Iok8SApiCoreV1VolumeMount;
            kubeVolumeMount.name = kubeVolume.name;
            kubeVolumeMount.mountPath = volume.target;
          }
        }
        kubeDeployObj.spec.template.spec.volumes.push(kubeVolume);
      }
    }
    if (service.configs) {
      kubeDeployObj.spec.template.spec.volumes = kubeDeployObj.spec.template.spec.volumes || [];
      for (let config of service.configs) {
        // short syntax
        if (typeof config === 'string') {
          // search for the config in the top-level configs
          const configObj = composeObj.configs?.[config];
          if (configObj && configObj.file) {
            const kubeVolume: Iok8SApiCoreV1Volume = {} as Iok8SApiCoreV1Volume;
            kubeVolume.name = convertName(config);
            // TODO we need to populate this config map with the file content
            kubeVolume.configMap = {name: convertName(config)};

            container.volumeMounts = container.volumeMounts || [];
            const kubeVolumeMount: Iok8SApiCoreV1VolumeMount = {} as Iok8SApiCoreV1VolumeMount;
            kubeVolumeMount.name = kubeVolume.name;
            kubeVolumeMount.mountPath = `/${config}`;
            kubeVolumeMount.readOnly = true;
            container.volumeMounts.push(kubeVolumeMount);

            kubeDeployObj.spec.template.spec.volumes.push(kubeVolume);
          }
        } else if (typeof config === 'object') {
          // long syntax
          if (config.source) {
            // search for the config in the top-level configs
            const configObj = composeObj.configs?.[config.source];
            if (configObj && configObj.file) {
              const kubeVolume: Iok8SApiCoreV1Volume = {} as Iok8SApiCoreV1Volume;
              kubeVolume.name = convertName(config.source);
              // TODO we need to populate this config map with the file content
              kubeVolume.configMap = {name: convertName(config.source)};

              container.volumeMounts = container.volumeMounts || [];
              const kubeVolumeMount: Iok8SApiCoreV1VolumeMount = {} as Iok8SApiCoreV1VolumeMount;
              kubeVolumeMount.name = kubeVolume.name;
              kubeVolumeMount.mountPath = config.target || `/${config.source}`;
              kubeVolumeMount.readOnly = true;
              container.volumeMounts.push(kubeVolumeMount);

              kubeDeployObj.spec.template.spec.volumes.push(kubeVolume);
            }
          }
        }
      }
    }
    if (service.secrets) {
      kubeDeployObj.spec.template.spec.volumes = kubeDeployObj.spec.template.spec.volumes || [];
      for (let secret of service.secrets) {
        // short syntax
        if (typeof secret === 'string') {
          // search for the secret in the top-level secrets
          const secretObj = composeObj.secrets?.[secret];
          if (secretObj && secretObj.file) {
            const kubeVolume: Iok8SApiCoreV1Volume = {} as Iok8SApiCoreV1Volume;
            kubeVolume.name = convertName(secret);
            // TODO we need to populate this secret with the file content
            kubeVolume.secret = {secretName: convertName(secret)};

            container.volumeMounts = container.volumeMounts || [];
            const kubeVolumeMount: Iok8SApiCoreV1VolumeMount = {} as Iok8SApiCoreV1VolumeMount;
            kubeVolumeMount.name = kubeVolume.name;
            kubeVolumeMount.mountPath = `/run/secrets/${secret}`;
            kubeVolumeMount.readOnly = true;
            container.volumeMounts.push(kubeVolumeMount);

            kubeDeployObj.spec.template.spec.volumes.push(kubeVolume);
          }
        } else if (typeof secret === 'object') {
          // long syntax
          if (secret.source) {
            // search for the secret in the top-level secrets
            const secretObj = composeObj.secrets?.[secret.source];
            if (secretObj && secretObj.file) {
              const kubeVolume: Iok8SApiCoreV1Volume = {} as Iok8SApiCoreV1Volume;
              kubeVolume.name = convertName(secret.source);
              // TODO we need to populate this secret with the file content
              kubeVolume.secret = {secretName: convertName(secret.source)};

              container.volumeMounts = container.volumeMounts || [];
              const kubeVolumeMount: Iok8SApiCoreV1VolumeMount = {} as Iok8SApiCoreV1VolumeMount;
              kubeVolumeMount.name = kubeVolume.name;
              if (secret.target) {
                kubeVolumeMount.mountPath = secret.target.startsWith('/') ? secret.target : `/run/secrets/${secret.target}`;
              } else {
                kubeVolumeMount.mountPath = `/run/secrets/${secret.source}`;
              }
              kubeVolumeMount.readOnly = true;
              container.volumeMounts.push(kubeVolumeMount);

              kubeDeployObj.spec.template.spec.volumes.push(kubeVolume);
            }
          }
        }
      }
    }
    if (service.tmpfs) {
      kubeDeployObj.spec.template.spec.volumes = kubeDeployObj.spec.template.spec.volumes || [];
      if (typeof service.tmpfs === 'string') {
        const kubeVolume: Iok8SApiCoreV1Volume = {} as Iok8SApiCoreV1Volume;
        kubeVolume.name = convertName(service.tmpfs);
        kubeVolume.emptyDir = {};
        container.volumeMounts = container.volumeMounts || [];
        const kubeVolumeMount: Iok8SApiCoreV1VolumeMount = {} as Iok8SApiCoreV1VolumeMount;
        kubeVolumeMount.name = kubeVolume.name;
        kubeVolumeMount.mountPath = service.tmpfs;
        container.volumeMounts.push(kubeVolumeMount);
        kubeDeployObj.spec.template.spec.volumes.push(kubeVolume);
      } else if (Array.isArray(service.tmpfs)) {
        for (let tmpfs of service.tmpfs) {
          const kubeVolume: Iok8SApiCoreV1Volume = {} as Iok8SApiCoreV1Volume;
          kubeVolume.name = convertName(tmpfs);
          kubeVolume.emptyDir = {};
          container.volumeMounts = container.volumeMounts || [];
          const kubeVolumeMount: Iok8SApiCoreV1VolumeMount = {} as Iok8SApiCoreV1VolumeMount;
          kubeVolumeMount.name = kubeVolume.name;
          kubeVolumeMount.mountPath = tmpfs;
          container.volumeMounts.push(kubeVolumeMount);
          kubeDeployObj.spec.template.spec.volumes.push(kubeVolume);
        }
      }
    }

    // deployment.spec.template.spec.containers.ports
    container.ports = [];

    const servicePorts = service.ports;
    // service.expose is the same as service.ports
    service.expose?.map((port) => { servicePorts?.push(port) });
    if (servicePorts) {
      const ports: Iok8SApiCoreV1ContainerPort[] = [];
      for (let port of servicePorts) {
        const ports1: Iok8SApiCoreV1ContainerPort[] = [];
        if (typeof port === 'string') {
          // syntax: [HOST:]CONTAINER[/PROTOCOL], where HOST is [IP:](port | range), and CONTAINER is port | range, and PROTOCOL is tcp | udp
          const protocol = port.split('/')[1] || 'TCP';
          port = port.split('/')[0];
          const splitted = port.split(':');
          // get the last item
          const containerPortOrRange = splitted.pop() || fail();
          const hostPortOrRange = splitted.pop();
          const hostIp = splitted.pop();
          const [min, max] = containerPortOrRange.includes('-') ? containerPortOrRange.split('-') : [containerPortOrRange, containerPortOrRange];
          for (let i = parseInt(min); i <= parseInt(max); i++) {
            const containerPort: Iok8SApiCoreV1ContainerPort = {} as Iok8SApiCoreV1ContainerPort;
            containerPort.containerPort = i;
            containerPort.protocol = protocol;
            ports1.push(containerPort);
          }
          if (hostPortOrRange) {
            const [min, max] = hostPortOrRange.includes('-') ? hostPortOrRange.split('-') : [hostPortOrRange, hostPortOrRange];
            const hostPorts: number[] = [];
            for (let i = parseInt(min); i <= parseInt(max); i++) {
              hostPorts.push(i);
            }
            // match each ports1 to each hostPorts
            for (let i = 0; i < ports1.length; i++) {
              const kubeService: Iok8SApiCoreV1Service = {} as Iok8SApiCoreV1Service;
              kubeService.apiVersion = 'v1';
              kubeService.kind = 'Service';
              kubeService.metadata = {} as Iok8SApimachineryPkgApisMetaV1ObjectMeta3;
              kubeService.metadata.namespace = config.namespace;
              kubeService.metadata.name = `${name}-${hostPorts[i]}`;
              kubeService.metadata.namespace = config.namespace;
              kubeService.metadata.labels = {};
              kubeService.metadata.labels.app = name;

              kubeService.spec = {} as Iok8SApiCoreV1ServiceSpec;
              kubeService.spec.ports = [] as Iok8SApiCoreV1ServicePort[];
              const servicePort: Iok8SApiCoreV1ServicePort = {} as Iok8SApiCoreV1ServicePort;
              servicePort.appProtocol = protocol;
              servicePort.targetPort = ports1[i].containerPort;
              servicePort.port = hostPorts[i];
              kubeService.spec.ports.push(servicePort);

              kubeService.spec.selector = {};
              kubeService.spec.selector.app = name;
              kubeSpecList.push(kubeService);
            }
          }
          ports.push(...ports1);
        } else if (typeof port === 'number') {
          const containerPort: Iok8SApiCoreV1ContainerPort = {} as Iok8SApiCoreV1ContainerPort;
          containerPort.containerPort = port;
          containerPort.protocol = 'TCP';
          ports.push(containerPort);
        } else if (typeof port === 'object') {
          const containerPort: Iok8SApiCoreV1ContainerPort = {} as Iok8SApiCoreV1ContainerPort;
          containerPort.containerPort = port.target || fail();
          containerPort.protocol = port.protocol || 'TCP';
          ports.push(containerPort);
        }
      }
      container.ports = ports;
    }

    // deployment.spec.template.spec.containers.env
    container.env = [];
    if (service.environment) {
      // check if it's an array
      if (Array.isArray(service.environment)) {
        // array of strings
        for (let env of service.environment) {
          const [name, value] = env.split('=');
          const envVar: Iok8SApiCoreV1EnvVar = {} as Iok8SApiCoreV1EnvVar;
          envVar.name = name;
          envVar.value = value;
          container.env.push(envVar);
        }
      } else {
        // object
        for (let name in service.environment) {
          const envVar: Iok8SApiCoreV1EnvVar = {} as Iok8SApiCoreV1EnvVar;
          envVar.name = name;
          envVar.value = service.environment[name]?.toString();
          container.env.push(envVar);
        }
      }
    }

    // deployment.spec.template.spec.securityContext
    if (service.group_add) {
      const securityContext: Iok8SApiCoreV1PodSecurityContext = {} as Iok8SApiCoreV1PodSecurityContext;
      securityContext.supplementalGroups = [];
      for (let group of service.group_add) {
        if (typeof group === 'string') {
          // TODO: should report warning if it's not a number
          group = parseInt(group);
        }
        if (group) {
          securityContext.supplementalGroups.push(group);
        }
      }
      kubeDeployObj.spec.template.spec.securityContext = securityContext;
    }

    // deployment.spec.template.spec.containers.securityContext
    if (service.cap_add || service.cap_drop) {
      container.securityContext = {} as Iok8SApiCoreV1SecurityContext;
      container.securityContext.capabilities = {} as Iok8SApiCoreV1Capabilities;
      if (service.cap_add) {
        container.securityContext.capabilities.add = [];
        for (let cap of service.cap_add) {
          container.securityContext.capabilities.add.push(cap);
        }
      }
      if (service.cap_drop) {
        container.securityContext.capabilities.drop = [];
        for (let cap of service.cap_drop) {
          container.securityContext.capabilities.drop.push(cap);
        }
      }
    }

    // deployment.spec.template.spec.containers.resources
    if (service.deploy && service.deploy.resources) {
      container.resources = {} as Iok8SApiCoreV1ResourceRequirements;
      container.resources.limits = {};
      container.resources.requests = {};
      if (service.deploy.resources.reservations) {
        if (service.deploy.resources.reservations.cpus) {
          container.resources.requests.cpu = `${parseFloat(service.deploy.resources.reservations.cpus.toString()) * 1000}m`;
        }
        if (service.deploy.resources.reservations.memory) {
          container.resources.requests.memory = service.deploy.resources.reservations.memory;
        }
      }
      if (service.deploy.resources.limits) {
        if (service.deploy.resources.limits.cpus) {
          container.resources.limits.cpu = `${parseFloat(service.deploy.resources.limits.cpus.toString()) * 1000}m`;
        }
        if (service.deploy.resources.limits.memory) {
          container.resources.limits.memory = service.deploy.resources.limits.memory;
        }
      }
    }

    // deployment.spec.template.spec.containers.livenessProbe
    if (service.healthcheck) {
      const livenessProbe = {} as Iok8SApiCoreV1Probe;
      if (service.healthcheck.start_period) {
        livenessProbe.initialDelaySeconds = convertDurationToNumber(service.healthcheck.start_period);
      }
      if (service.healthcheck.interval) {
        livenessProbe.periodSeconds = convertDurationToNumber(service.healthcheck.interval);
      }
      if (service.healthcheck.timeout) {
        livenessProbe.timeoutSeconds = convertDurationToNumber(service.healthcheck.timeout);
      }
      if (service.healthcheck.retries) {
        livenessProbe.failureThreshold = service.healthcheck.retries;
      }
      if (service.healthcheck.test) {
        livenessProbe.exec = {} as Iok8SApiCoreV1ExecAction;
        // CMD-SHELL
        if (typeof service.healthcheck.test === 'string') {
          livenessProbe.exec.command = ['/bin/sh', '-c', service.healthcheck.test];
        } else {
          // CMD
          if (service.healthcheck.test[0] === 'CMD') {
            livenessProbe.exec.command = service.healthcheck.test.slice(1);
          } 
          // CMD-SHELL
          else if (service.healthcheck.test[0] === 'CMD-SHELL') {
            livenessProbe.exec.command = ['/bin/sh', '-c', service.healthcheck.test.slice(1).join(' ')];
          }
        }
      }
      // is exec defined?
      if (livenessProbe.exec && livenessProbe.exec.command) {
        container.livenessProbe = livenessProbe;
      }
    }

    kubeDeployObj.spec.template.spec.containers.push(container);

    kubeSpecList.push(kubeDeployObj);
  }

  let ret = "";
  for (let kubeSpec of kubeSpecList) {
    ret += '---\n' + stringify(kubeSpec);
  }
  return ret;
}

export default convert;
