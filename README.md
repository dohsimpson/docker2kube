# docker2kube (d2k)

d2k is a typescript library that converts docker-compose YAML files to Kubernetes YAML file. The goal is to make it easy to deploy docker project on Kubernetes.

# UI
Visit https://docker2kube.app.enting.org/ to perform conversion online.

# Installation
NPM: `npm i docker2kube`

YARN: `yarn add docker2kube`

# Usage
```javascript
import { convert } from 'docker2kube';

const composeYaml = `\
version: '3'

services:
  nginx:
    image: nginx:latest
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
    restart: always
`;

const output = convert(composeYaml);
console.log(output);
```


# Acknowledgment

* [kompose](https://github.com/kubernetes/kompose) is the canonical tool for converting docker-compose templates. And inspired this project.
* [json-schema-to-typescript](https://github.com/bcherny/json-schema-to-typescript) makes working with JSON schema a dream.
* [composerize](https://github.com/magicmark/composerize) for converting docker command.
