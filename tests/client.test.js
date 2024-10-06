import { join } from 'path';
import { jest as otherJest } from '@jest/globals'

import Client from '../src/client.class';
import { streamToString } from '../src/stream';

const testPrefix = join('s3db', 'tests', new Date().toISOString().substring(0, 10), 'client-' + Date.now())

describe('Client', () => {
  let client

  beforeEach(async () => {
    client = new Client({
      verbose: true,
      connectionString: process.env.BUCKET_CONNECTION_STRING
        .replace('USER', process.env.MINIO_USER)
        .replace('PASSWORD', process.env.MINIO_PASSWORD)
      + `/${testPrefix}`
    });
  })

  test('complete client tests', async () => {
    const evtCommandRequest = otherJest.fn();
    const evtCommandResponse = otherJest.fn();
    const evtPutObject = otherJest.fn();
    const evtGetObject = otherJest.fn();
    const evtHeadObject = otherJest.fn();
    const evtDeleteObject = otherJest.fn();
    const evtDeleteObjects = otherJest.fn();
    const evtListObjects = otherJest.fn();
    const evtCount = otherJest.fn();
    const evtGetAllKeys = otherJest.fn();

    client.on('command.request', evtCommandRequest);
    client.on('command.response', evtCommandResponse);
    client.on('putObject', evtPutObject);
    client.on('getObject', evtGetObject);
    client.on('headObject', evtHeadObject);
    client.on('deleteObject', evtDeleteObject);
    client.on('deleteObjects', evtDeleteObjects);
    client.on('listObjects', evtListObjects);
    client.on('count', evtCount);
    client.on('getAllKeys', evtGetAllKeys);

    const common = {
      body: 'Hello, World!',
      contentType: 'text/plain',
    }

    const [put1, put2, put3] = await Promise.all([
      client.putObject({
        key: 'test1.txt',
        metadata: { A: '1' },
        ...common,
      }),
      client.putObject({
        key: 'test2.txt',
        metadata: { A: '2' },
        ...common,
      }),
      client.putObject({
        key: 'test3.txt',
        metadata: { A: '3' },
        ...common,
      }),
    ])

    expect(put1).toBeDefined();
    expect(put2).toBeDefined();
    expect(put3).toBeDefined();
    expect(evtCommandRequest).toHaveBeenCalled();
    expect(evtCommandResponse).toHaveBeenCalled();
    expect(evtPutObject).toHaveBeenCalled();

    const [head1, get1] = await Promise.all([
      client.headObject('test1.txt'),
      client.getObject('test1.txt'),
    ])

    expect(head1).toBeDefined();
    expect(get1).toBeDefined();
    expect(evtGetObject).toHaveBeenCalled();
    expect(evtHeadObject).toHaveBeenCalled();

    const content = await streamToString(get1.Body);
    expect(content).toBe('Hello, World!');

    const list1 = await client.listObjects();
    expect(list1).toBeDefined();
    expect(list1.KeyCount).toBe(3);
    expect(evtListObjects).toHaveBeenCalled();

    const count1 = await client.count();
    expect(count1).toBeDefined();
    expect(count1).toBe(3);
    expect(evtCount).toHaveBeenCalled();

    const allkeys = await client.getAllKeys();
    expect(allkeys).toBeDefined();
    expect(allkeys.length).toBe(3);
    expect(allkeys).toStrictEqual([
      'test1.txt',
      'test2.txt',
      'test3.txt',
    ]);
    expect(evtGetAllKeys).toHaveBeenCalled();

    const del1 = await client.deleteObject('test1.txt');
    expect(del1).toBeDefined();
    expect(evtDeleteObject).toHaveBeenCalled();

    const list2 = await client.listObjects();
    expect(list2).toBeDefined();
    expect(list2.KeyCount).toBe(2);

    const del2 = await client.deleteObjects(['test2.txt', 'test3.txt']);
    expect(del2).toBeDefined();
    expect(evtDeleteObjects).toHaveBeenCalled();

    const list3 = await client.listObjects();
    expect(list3).toBeDefined();
    expect(list3.KeyCount).toBe(0);

    const [put4, put5] = await Promise.all([
      client.putObject({
        key: 'dir=a/test1.txt',
        metadata: { A: '4' },
        ...common,
      }),
      client.putObject({
        key: 'dir=a/test2.txt',
        metadata: { A: '5' },
        ...common,
      }),
    ])

    const cp1 = await client.copyObject({
      from: 'dir=a/test1.txt', 
      to: 'dir=a/test3.txt'
    });
    
    const exists1 = await client.exists('dir=a/test1.txt');
    const exists2 = await client.exists('dir=a/test3.txt');
    expect(cp1).toBeDefined();
    expect(exists1).toBe(true);
    expect(exists2).toBe(true);

    const mov1 = await client.moveObject({
      from: 'dir=a/test1.txt', 
      to: 'dib=b/test1.txt'
    });
    expect(mov1).toBe(true);
    const exists3 = await client.exists('dir=a/test1.txt');
    const exists4 = await client.exists('dib=b/test1.txt');
    expect(exists3).toBe(false);
    expect(exists4).toBe(true);

    await client.moveAllObjects({
      prefixFrom: 'dir=a',
      prefixTo: 'dib=b'
    })
    const exists5 = await client.exists('dir=a/test2.txt');
    const exists6 = await client.exists('dib=b/test2.txt');
    expect(exists5).toBe(false);
    expect(exists6).toBe(true);
  });
});
