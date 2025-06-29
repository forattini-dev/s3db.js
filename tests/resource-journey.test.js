import { S3DB } from '../src/index.js';

describe('Resource Journey Tests - Dog Breeds Management', () => {
  let s3db;
  let dogsResource;

  beforeAll(async () => {
    s3db = new S3DB({
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'test-access-key',
      secretAccessKey: 'test-secret-key',
      endpoint: 'http://localhost:4566',
      forcePathStyle: true,
    });

    // Criar recurso de raças de cachorros particionadas por tamanho
    dogsResource = s3db.resource({
      name: 'dogs',
      version: '1',
      options: {
        timestamps: true,
        partitions: {
          bySize: {
            fields: {
              size: 'string|maxlength:10'
            }
          },
          byOrigin: {
            fields: {
              origin: 'string|maxlength:20'
            }
          }
        }
      },
      attributes: {
        name: 'string|required|maxlength:50',
        size: 'string|required|in:small,medium,large,giant',
        origin: 'string|required|maxlength:30',
        weight: 'number|min:1|max:200',
        temperament: 'array|optional',
        description: 'string|optional|maxlength:500',
        isHypoallergenic: 'boolean|optional'
      }
    });
  });

  describe('Cenário 1: Adicionando 50 raças de cachorro particionadas por tamanho', () => {
    const dogBreeds = [
      // Small dogs
      { name: 'Chihuahua', size: 'small', origin: 'Mexico', weight: 2, temperament: ['alert', 'lively'], isHypoallergenic: false },
      { name: 'Yorkshire Terrier', size: 'small', origin: 'England', weight: 3, temperament: ['brave', 'determined'], isHypoallergenic: true },
      { name: 'Maltese', size: 'small', origin: 'Malta', weight: 3, temperament: ['gentle', 'playful'], isHypoallergenic: true },
      { name: 'Pomeranian', size: 'small', origin: 'Germany', weight: 4, temperament: ['alert', 'curious'], isHypoallergenic: false },
      { name: 'Papillon', size: 'small', origin: 'France', weight: 4, temperament: ['intelligent', 'alert'], isHypoallergenic: false },
      { name: 'Cavalier King Charles', size: 'small', origin: 'England', weight: 7, temperament: ['affectionate', 'gentle'], isHypoallergenic: false },
      { name: 'French Bulldog', size: 'small', origin: 'France', weight: 12, temperament: ['adaptable', 'playful'], isHypoallergenic: false },
      { name: 'Boston Terrier', size: 'small', origin: 'USA', weight: 12, temperament: ['friendly', 'bright'], isHypoallergenic: false },
      { name: 'Pug', size: 'small', origin: 'China', weight: 8, temperament: ['charming', 'mischievous'], isHypoallergenic: false },
      { name: 'Dachshund', size: 'small', origin: 'Germany', weight: 11, temperament: ['curious', 'friendly'], isHypoallergenic: false },
      { name: 'Shih Tzu', size: 'small', origin: 'Tibet', weight: 7, temperament: ['affectionate', 'outgoing'], isHypoallergenic: true },
      { name: 'Jack Russell Terrier', size: 'small', origin: 'England', weight: 6, temperament: ['energetic', 'fearless'], isHypoallergenic: false },

      // Medium dogs
      { name: 'Beagle', size: 'medium', origin: 'England', weight: 25, temperament: ['friendly', 'curious'], isHypoallergenic: false },
      { name: 'Border Collie', size: 'medium', origin: 'Scotland', weight: 30, temperament: ['intelligent', 'energetic'], isHypoallergenic: false },
      { name: 'Australian Shepherd', size: 'medium', origin: 'USA', weight: 35, temperament: ['smart', 'work-oriented'], isHypoallergenic: false },
      { name: 'Cocker Spaniel', size: 'medium', origin: 'Spain', weight: 30, temperament: ['gentle', 'smart'], isHypoallergenic: false },
      { name: 'Bull Terrier', size: 'medium', origin: 'England', weight: 35, temperament: ['playful', 'charming'], isHypoallergenic: false },
      { name: 'Siberian Husky', size: 'medium', origin: 'Russia', weight: 35, temperament: ['outgoing', 'mischievous'], isHypoallergenic: false },
      { name: 'Standard Poodle', size: 'medium', origin: 'Germany', weight: 32, temperament: ['active', 'proud'], isHypoallergenic: true },
      { name: 'Brittany', size: 'medium', origin: 'France', weight: 35, temperament: ['eager', 'athletic'], isHypoallergenic: false },
      { name: 'Whippet', size: 'medium', origin: 'England', weight: 28, temperament: ['calm', 'friendly'], isHypoallergenic: false },
      { name: 'Basenji', size: 'medium', origin: 'Congo', weight: 24, temperament: ['independent', 'smart'], isHypoallergenic: false },
      { name: 'Australian Cattle Dog', size: 'medium', origin: 'Australia', weight: 35, temperament: ['alert', 'curious'], isHypoallergenic: false },
      { name: 'Welsh Corgi', size: 'medium', origin: 'Wales', weight: 30, temperament: ['affectionate', 'smart'], isHypoallergenic: false },

      // Large dogs
      { name: 'Labrador Retriever', size: 'large', origin: 'Canada', weight: 65, temperament: ['friendly', 'outgoing'], isHypoallergenic: false },
      { name: 'Golden Retriever', size: 'large', origin: 'Scotland', weight: 65, temperament: ['friendly', 'intelligent'], isHypoallergenic: false },
      { name: 'German Shepherd', size: 'large', origin: 'Germany', weight: 65, temperament: ['confident', 'versatile'], isHypoallergenic: false },
      { name: 'Boxer', size: 'large', origin: 'Germany', weight: 70, temperament: ['fun-loving', 'bright'], isHypoallergenic: false },
      { name: 'Rottweiler', size: 'large', origin: 'Germany', weight: 85, temperament: ['loyal', 'loving'], isHypoallergenic: false },
      { name: 'Doberman Pinscher', size: 'large', origin: 'Germany', weight: 75, temperament: ['alert', 'fearless'], isHypoallergenic: false },
      { name: 'Weimaraner', size: 'large', origin: 'Germany', weight: 70, temperament: ['friendly', 'fearless'], isHypoallergenic: false },
      { name: 'Portuguese Water Dog', size: 'large', origin: 'Portugal', weight: 50, temperament: ['adventurous', 'athletic'], isHypoallergenic: true },
      { name: 'Standard Schnauzer', size: 'large', origin: 'Germany', weight: 45, temperament: ['friendly', 'spirited'], isHypoallergenic: true },
      { name: 'Rhodesian Ridgeback', size: 'large', origin: 'Zimbabwe', weight: 70, temperament: ['affectionate', 'dignified'], isHypoallergenic: false },
      { name: 'Belgian Malinois', size: 'large', origin: 'Belgium', weight: 60, temperament: ['confident', 'hardworking'], isHypoallergenic: false },
      { name: 'Vizsla', size: 'large', origin: 'Hungary', weight: 55, temperament: ['affectionate', 'gentle'], isHypoallergenic: false },

      // Giant dogs
      { name: 'Great Dane', size: 'giant', origin: 'Germany', weight: 140, temperament: ['friendly', 'patient'], isHypoallergenic: false },
      { name: 'Saint Bernard', size: 'giant', origin: 'Switzerland', weight: 140, temperament: ['playful', 'charming'], isHypoallergenic: false },
      { name: 'Mastiff', size: 'giant', origin: 'England', weight: 160, temperament: ['courageous', 'dignified'], isHypoallergenic: false },
      { name: 'Newfoundland', size: 'giant', origin: 'Canada', weight: 130, temperament: ['sweet', 'patient'], isHypoallergenic: false },
      { name: 'Irish Wolfhound', size: 'giant', origin: 'Ireland', weight: 120, temperament: ['dignified', 'calm'], isHypoallergenic: false },
      { name: 'Great Pyrenees', size: 'giant', origin: 'France', weight: 100, temperament: ['smart', 'patient'], isHypoallergenic: false },
      { name: 'Leonberger', size: 'giant', origin: 'Germany', weight: 110, temperament: ['friendly', 'gentle'], isHypoallergenic: false },
      { name: 'Tibetan Mastiff', size: 'giant', origin: 'Tibet', weight: 100, temperament: ['independent', 'reserved'], isHypoallergenic: false },
      { name: 'Anatolian Shepherd', size: 'giant', origin: 'Turkey', weight: 110, temperament: ['loyal', 'independent'], isHypoallergenic: false },
      { name: 'Cane Corso', size: 'giant', origin: 'Italy', weight: 100, temperament: ['assertive', 'confident'], isHypoallergenic: false },
      { name: 'Boerboel', size: 'giant', origin: 'South Africa', weight: 150, temperament: ['confident', 'calm'], isHypoallergenic: false },
      { name: 'Caucasian Shepherd', size: 'giant', origin: 'Georgia', weight: 130, temperament: ['bold', 'fearless'], isHypoallergenic: false }
    ];

    test('Deve inserir todas as 50 raças de cachorro com sucesso', async () => {
      const insertedDogs = [];
      
      for (const dog of dogBreeds) {
        const inserted = await dogsResource.insert(dog);
        insertedDogs.push(inserted);
        
        expect(inserted.id).toBeDefined();
        expect(inserted.name).toBe(dog.name);
        expect(inserted.size).toBe(dog.size);
        expect(inserted.createdAt).toBeDefined();
        expect(inserted.updatedAt).toBeDefined();
      }
      
      expect(insertedDogs).toHaveLength(50);
    });

    test('Deve contar corretamente o número de cachorros por partição de tamanho', async () => {
      const smallCount = await dogsResource.count({ 
        partition: 'bySize', 
        partitionValues: { size: 'small' } 
      });
      const mediumCount = await dogsResource.count({ 
        partition: 'bySize', 
        partitionValues: { size: 'medium' } 
      });
      const largeCount = await dogsResource.count({ 
        partition: 'bySize', 
        partitionValues: { size: 'large' } 
      });
      const giantCount = await dogsResource.count({ 
        partition: 'bySize', 
        partitionValues: { size: 'giant' } 
      });

      expect(smallCount).toBe(12);
      expect(mediumCount).toBe(12); 
      expect(largeCount).toBe(12);
      expect(giantCount).toBe(12);
    });
  });

  describe('Cenário 2: Testando paginação com limite de 10 em 10', () => {
    test('Deve paginar cachorros pequenos corretamente', async () => {
      // Primeira página (limite 10)
      const page1 = await dogsResource.page({
        size: 10,
        offset: 0,
        partition: 'bySize',
        partitionValues: { size: 'small' }
      });

      expect(page1.data).toHaveLength(10);
      expect(page1.pagination.total).toBe(12);
      expect(page1.pagination.hasMore).toBe(true);

      // Segunda página (restantes 2)
      const page2 = await dogsResource.page({
        size: 10,
        offset: 10,
        partition: 'bySize',
        partitionValues: { size: 'small' }
      });

      expect(page2.data).toHaveLength(2);
      expect(page2.pagination.hasMore).toBe(false);

      // Verificar que não há duplicatas entre páginas
      const page1Names = page1.data.map(dog => dog.name);
      const page2Names = page2.data.map(dog => dog.name);
      const allNames = [...page1Names, ...page2Names];
      const uniqueNames = [...new Set(allNames)];
      
      expect(allNames).toHaveLength(12);
      expect(uniqueNames).toHaveLength(12);
    });

    test('Deve verificar se todas as raças estão distribuídas corretamente nas páginas', async () => {
      const allDogs = [];
      let offset = 0;
      const pageSize = 10;
      let hasMore = true;

      while (hasMore) {
        const page = await dogsResource.page({
          size: pageSize,
          offset,
          partition: 'bySize',
          partitionValues: { size: 'medium' }
        });

        allDogs.push(...page.data);
        hasMore = page.pagination.hasMore;
        offset += pageSize;
      }

      expect(allDogs).toHaveLength(12);
      
      // Verificar que todos são de tamanho médio
      allDogs.forEach(dog => {
        expect(dog.size).toBe('medium');
      });
    });
  });

  describe('Cenário 3: Teste de corner cases e validações', () => {
    test('Deve rejeitar cachorro com tamanho inválido', async () => {
      await expect(dogsResource.insert({
        name: 'Invalid Dog',
        size: 'extra-large', // Tamanho inválido
        origin: 'Unknown',
        weight: 50
      })).rejects.toThrow();
    });

    test('Deve rejeitar cachorro com peso negativo', async () => {
      await expect(dogsResource.insert({
        name: 'Negative Weight Dog',
        size: 'medium',
        origin: 'Test',
        weight: -5 // Peso inválido
      })).rejects.toThrow();
    });

    test('Deve permitir temperamento como array vazio', async () => {
      const dog = await dogsResource.insert({
        name: 'Quiet Dog',
        size: 'medium',
        origin: 'Test',
        weight: 25,
        temperament: [] // Array vazio deve ser permitido
      });

      expect(dog.temperament).toEqual([]);
    });

    test('Deve criar e atualizar timestamps automaticamente', async () => {
      const dog = await dogsResource.insert({
        name: 'Timestamp Test Dog',
        size: 'small',
        origin: 'Test',
        weight: 5
      });

      expect(dog.createdAt).toBeDefined();
      expect(dog.updatedAt).toBeDefined();
      expect(dog.createdAt).toBe(dog.updatedAt);

      // Simular delay e atualizar
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const updated = await dogsResource.update(dog.id, {
        weight: 6
      });

      expect(updated.updatedAt).not.toBe(updated.createdAt);
      expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(new Date(updated.createdAt).getTime());
    });
  });

  describe('Cenário 4: Testando partições por origem', () => {
    test('Deve listar cachorros alemães corretamente', async () => {
      const germanDogs = await dogsResource.list({
        partition: 'byOrigin',
        partitionValues: { origin: 'Germany' }
      });

      expect(germanDogs.length).toBeGreaterThan(0);
      
      germanDogs.forEach(dog => {
        expect(dog.origin).toBe('Germany');
      });

      // Verificar algumas raças alemãs específicas
      const germanNames = germanDogs.map(dog => dog.name);
      expect(germanNames).toContain('German Shepherd');
      expect(germanNames).toContain('Boxer');
      expect(germanNames).toContain('Rottweiler');
    });

    test('Deve verificar distribuição por países', async () => {
      const countries = ['Germany', 'England', 'France', 'USA'];
      const countsByCountry = {};

      for (const country of countries) {
        const count = await dogsResource.count({
          partition: 'byOrigin',
          partitionValues: { origin: country }
        });
        countsByCountry[country] = count;
      }

      // Alemanha deve ter mais raças (observando os dados inseridos)
      expect(countsByCountry['Germany']).toBeGreaterThan(countsByCountry['USA']);
      expect(countsByCountry['England']).toBeGreaterThan(0);
      expect(countsByCountry['France']).toBeGreaterThan(0);
    });
  });

  describe('Cenário 5: Operações CRUD complexas', () => {
    test('Deve fazer upsert de uma nova raça', async () => {
      const newBreed = {
        id: 'custom-breed-001',
        name: 'Custom Mixed Breed',
        size: 'medium',
        origin: 'Mixed',
        weight: 30,
        temperament: ['friendly', 'loyal'],
        isHypoallergenic: false
      };

      const upserted = await dogsResource.upsert(newBreed);
      expect(upserted.id).toBe('custom-breed-001');
      expect(upserted.name).toBe('Custom Mixed Breed');
    });

    test('Deve deletar múltiplas raças e verificar contagem', async () => {
      // Buscar algumas raças para deletar
      const giantDogs = await dogsResource.list({
        partition: 'bySize',
        partitionValues: { size: 'giant' },
        limit: 3
      });

      const idsToDelete = giantDogs.map(dog => dog.id);
      
      const initialCount = await dogsResource.count({
        partition: 'bySize',
        partitionValues: { size: 'giant' }
      });

      await dogsResource.deleteMany(idsToDelete);

      const finalCount = await dogsResource.count({
        partition: 'bySize',
        partitionValues: { size: 'giant' }
      });

      expect(finalCount).toBe(initialCount - 3);
    });

    test('Deve verificar existência de raça específica', async () => {
      const labrador = await dogsResource.list({
        limit: 1
      });

      if (labrador.length > 0) {
        const exists = await dogsResource.exists(labrador[0].id);
        expect(exists).toBe(true);
      }

      const fakeExists = await dogsResource.exists('fake-id-12345');
      expect(fakeExists).toBe(false);
    });
  });
});