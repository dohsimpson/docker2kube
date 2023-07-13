function convertDurationToNumber(duration: string): number {
  // Values express a duration as a string in the form of {value}{unit}. The supported units are us (microseconds), ms (milliseconds), s (seconds), m (minutes) and h (hours). Values can combine multiple values without separator.
  // https://github.com/compose-spec/compose-spec/blob/master/11-extension.md#specifying-durations
  // e.g. 1h5m30s20ms
  const regex = /(?<value>\d+)(?<unit>[a-z]+)/g;
  const matches = Array.from(duration.matchAll(regex));
  const multipliers: {[k: string]: number} = {
    us: 1,
    ms: 1000,
    s: 1000 * 1000,
    m: 1000 * 1000 * 60,
    h: 1000 * 1000 * 60 * 60,
  }
  const total = matches.reduce((acc, match) => {
    const { value, unit } = match.groups!;
    const multiplier = multipliers[unit as string];
    if (!multiplier) {
      throw new Error(`unexpected unit: ${unit}`);
    }
    return acc + parseInt(value) * multiplier;
  } , 0);
  // convert microseconds to seconds
  return total / 1000 / 1000;
}

function convertName(name: string): string {
  // convert a string to a valid RFC 1123 hostname, compliant with Kubernetes naming requirements
  let result = name.toLowerCase();
  result = result.replace(/[^a-z0-9-]/g, '-');
  // must start and end with alphanumeric characters
  result = result.replace(/^-+/, '');
  result = result.replace(/-+$/, '');
  return result;
}

function generateRandomString(): string {
  const result = 'generated-' + Math.random().toString(36).substring(2, 15);
  return result;
}

function parseCommand(command: string): string[] {
  // parse a command string into an array of strings
  // e.g. "echo hello" => ["echo", "hello"]
  // e.g. "echo 'hello world'" => ["echo", "hello world"]
  // e.g. "echo \"hello world\"" => ["echo", "hello world"]
  // e.g. "echo \"hello 'world'\"" => ["echo", "hello 'world'"]

  const result: string[] = [];
  let current = '';
  let quote = '';
  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    if (char === ' ' && !quote) {
      if (current) {
        result.push(current);
        current = '';
      }
    } else if (char === '"' || char === "'") {
      if (quote === char) {
        quote = '';
      } else if (!quote) {
        quote = char;
      } else {
        current += char;
      }
    } else {
      current += char;
    }
  }
  if (current) {
    result.push(current);
  }
  return result;
}

function fail(): never {
  throw new Error('unexpected error') 
};

export { 
  convertDurationToNumber, 
  convertName, 
  generateRandomString, 
  parseCommand,
  fail 
}
