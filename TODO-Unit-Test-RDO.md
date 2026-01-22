# TODO: RDO Protocol Unit Testing with Simulation

## Question
**Serait-il pertinent d'intégrer des tests unitaire du protocole RDO afin de s'assurer que le code n'est pas altéré avec les mises à jours et respecte le protocole RDO avec de la simulation ?**

## Réponse: OUI, c'est hautement pertinent

### Bénéfices des tests RDO avec simulation

1. **Protection contre les régressions**
   - Les mises à jour du code peuvent casser le protocole sans qu'on s'en aperçoive
   - Les tests détectent immédiatement si un refactor altère le format RDO
   - Empêche les bugs silencieux (commandes mal formatées qui échouent côté serveur)

2. **Documentation vivante**
   - Les tests montrent comment le protocole RDO fonctionne réellement
   - Exemples concrets de commandes/réponses valides
   - Référence pour les nouveaux développeurs

3. **Développement plus rapide**
   - Pas besoin de se connecter au vrai serveur pour tester les changements
   - Tests instantanés vs. démarrage serveur + connexion manuelle
   - Isolation des problèmes (protocole vs. logique métier)

### Ce qui devrait être testé

#### 1. Tests d'intégration RDO (niveau session)

```typescript
describe('RDO Session Integration', () => {
  let mockSession: MockRdoSession;

  beforeEach(() => {
    mockSession = new MockRdoSession();
  });

  it('should complete login flow with correct RDO sequence', async () => {
    // Simule les commandes RDO envoyées pendant le login
    const commands = await mockSession.simulateLogin('testuser', 'password');

    expect(commands).toContainRdoCommand('SetLanguage', ['%English']);
    expect(commands).toContainRdoCommand('ClientAware', ['*']);
    expect(commands).toContainRdoCommand('Logon', ['%testuser', '%password']);
  });

  it('should send correct building focus command format', () => {
    const cmd = mockSession.buildFocusCommand(100, 200);

    // Vérifie le format exact: C <RID> sel <World ID> call RDOFocusObject "^" "#<x>","#<y>";
    expect(cmd).toMatch(/^C \d+ sel \d+ call RDOFocusObject "\^" "#100","#200";$/);
  });

  it('should parse building details response correctly', () => {
    const mockResponse = 'A123 res="%Building Name","#5","#10";';
    const details = mockSession.parseBuildingResponse(mockResponse);

    expect(details.name).toBe('Building Name');
    expect(details.xsize).toBe(5);
    expect(details.ysize).toBe(10);
  });
});
```

#### 2. Tests de séquences de commandes

```typescript
describe('RDO Command Sequences', () => {
  it('should send building property update with correct argument format', () => {
    const buildingId = 100575368;
    const newPrice = 220;

    const cmd = RdoCommand
      .sel(buildingId)
      .call('RDOSetPrice')
      .push()
      .args(RdoValue.int(0), RdoValue.int(newPrice))
      .build();

    expect(cmd).toBe('C sel 100575368 call RDOSetPrice "*" "#0","#220";');
  });

  it('should format RDOSetSalaries with all 3 arguments', () => {
    const cmd = buildRdoCommandArgs('RDOSetSalaries', {
      Salaries0: 100,
      Salaries1: 120,
      Salaries2: 150
    });

    expect(cmd).toBe('"#100","#120","#150"');
  });

  it('should use worldContextId for CreateCircuitSeg (not interfaceServerId)', () => {
    const worldContextId = 125086508; // Dynamic from Logon
    const cmd = RdoCommand
      .sel(worldContextId)
      .call('CreateCircuitSeg')
      .push()
      .args(
        RdoValue.int(1),    // circuitId (roads)
        RdoValue.int(12345), // ownerId (fTycoonProxyId)
        RdoValue.int(462),   // x1
        RdoValue.int(492),   // y1
        RdoValue.int(463),   // x2
        RdoValue.int(492),   // y2
        RdoValue.int(2000000) // cost
      )
      .build();

    expect(cmd).toContain(`sel ${worldContextId}`);
    expect(cmd).toContain('CreateCircuitSeg');
  });
});
```

#### 3. Tests de cas d'erreur

```typescript
describe('RDO Error Handling', () => {
  it('should handle server error responses correctly', () => {
    const errorResponse = 'E123 code="#404" msg="%Building not found";';
    const parsed = parseRdoError(errorResponse);

    expect(parsed.code).toBe(404);
    expect(parsed.message).toBe('Building not found');
  });

  it('should reject malformed RDO values', () => {
    expect(() => RdoParser.asInt('%notAnInt')).toThrow();
    expect(() => RdoParser.asFloat('#notAFloat')).toThrow();
  });

  it('should validate RDO command before sending', () => {
    const invalidCmd = 'C sel call RDOSetPrice'; // Missing arguments
    expect(validateRdoCommand(invalidCmd)).toBe(false);
  });
});
```

#### 4. Tests de parsing de réponses

```typescript
describe('RDO Response Parsing', () => {
  it('should parse InitClient packet with 4 values', () => {
    const response = 'C sel 123 call InitClient "*" "@45678.5","%1000000","#0","#987654";';
    const parsed = parseInitClientPacket(response);

    expect(parsed.virtualDate).toBe(45678.5);
    expect(parsed.accountMoney).toBe('1000000');
    expect(parsed.failureLevel).toBe(0);
    expect(parsed.fTycoonProxyId).toBe(987654);
  });

  it('should parse company list HTML with ownerRole attribute', () => {
    const html = '<td companyId="123" companyName="TestCo" companyOwnerRole="Mayor">...</td>';
    const companies = parseCompanyList(html);

    expect(companies[0].id).toBe(123);
    expect(companies[0].name).toBe('TestCo');
    expect(companies[0].ownerRole).toBe('Mayor');
  });

  it('should extract worldContextId from Logon response', () => {
    const response = 'A456 res="#125086508";';
    const worldContextId = parseIdOfResponse(response);

    expect(worldContextId).toBe(125086508);
  });
});
```

### Architecture proposée: MockRdoSession

```typescript
// src/server/__mocks__/mock-rdo-session.ts

export class MockRdoSession {
  private sentCommands: string[] = [];
  private mockResponses: Map<string, string> = new Map();

  // Enregistre les commandes envoyées
  send(command: string): void {
    this.sentCommands.push(command);
  }

  // Configure les réponses simulées
  mockResponse(commandPattern: RegExp, response: string): void {
    this.mockResponses.set(commandPattern.source, response);
  }

  // Simule une réponse du serveur
  simulateResponse(command: string): string {
    for (const [pattern, response] of this.mockResponses) {
      if (new RegExp(pattern).test(command)) {
        return response;
      }
    }
    throw new Error(`No mock response for command: ${command}`);
  }

  // Utilitaires de vérification
  getCommandHistory(): string[] {
    return this.sentCommands;
  }

  hasCommand(pattern: RegExp): boolean {
    return this.sentCommands.some(cmd => pattern.test(cmd));
  }

  getCommand(pattern: RegExp): string | undefined {
    return this.sentCommands.find(cmd => pattern.test(cmd));
  }

  // Simulations de flux complets
  async simulateLogin(username: string, password: string): Promise<string[]> {
    this.send(RdoCommand.sel(1).call('SetLanguage').push().args(RdoValue.string('English')).build());
    this.send(RdoCommand.sel(2).call('ClientAware').push().args().build());
    this.send(RdoCommand.sel(3).call('Logon').push().args(
      RdoValue.string(username),
      RdoValue.string(password)
    ).build());

    return this.sentCommands;
  }

  async simulateBuildingFocus(x: number, y: number): Promise<string> {
    const cmd = RdoCommand
      .sel(123)
      .call('RDOFocusObject')
      .push()
      .args(RdoValue.int(x), RdoValue.int(y))
      .build();

    this.send(cmd);
    return cmd;
  }

  async simulateBuildingUpdate(buildingId: number, property: string, value: number): Promise<string> {
    const cmd = RdoCommand
      .sel(buildingId)
      .call(property)
      .push()
      .args(RdoValue.int(0), RdoValue.int(value))
      .build();

    this.send(cmd);
    return cmd;
  }
}
```

### Matchers Jest personnalisés

```typescript
// src/server/__tests__/matchers/rdo-matchers.ts

export const rdoMatchers = {
  toContainRdoCommand(commands: string[], method: string, args?: string[]) {
    const pattern = new RegExp(`call ${method}`);
    const found = commands.find(cmd => pattern.test(cmd));

    if (!found) {
      return {
        pass: false,
        message: () => `Expected commands to contain RDO call to ${method}`
      };
    }

    if (args) {
      const hasArgs = args.every(arg => found.includes(arg));
      return {
        pass: hasArgs,
        message: () => hasArgs
          ? `Found RDO command with correct arguments`
          : `RDO command missing expected arguments: ${args.join(', ')}`
      };
    }

    return { pass: true, message: () => '' };
  },

  toMatchRdoFormat(command: string) {
    // Format: C [RID] sel <id> call <method> <type> [args];
    const pattern = /^C( \d+)? sel \d+ call \w+ "[*^]"( ".+")*;$/;
    const pass = pattern.test(command);

    return {
      pass,
      message: () => pass
        ? `Command matches RDO format`
        : `Command does not match RDO format: ${command}`
    };
  }
};

// Usage dans jest.config.js
expect.extend(rdoMatchers);
```

### Plan d'implémentation

#### Phase 1: Infrastructure (1-2 jours)
- [ ] Créer `MockRdoSession` class
- [ ] Créer matchers Jest personnalisés
- [ ] Configurer fichiers de test dans `src/server/__tests__/rdo/`

#### Phase 2: Tests critiques (2-3 jours)
- [ ] Tests de login flow (SetLanguage, ClientAware, Logon)
- [ ] Tests de sélection de compagnie (SelectCompany)
- [ ] Tests de focus building (RDOFocusObject)
- [ ] Tests de mise à jour propriétés (RDOSetPrice, RDOSetSalaries)

#### Phase 3: Tests avancés (2-3 jours)
- [ ] Tests de construction routes (CreateCircuitSeg avec staircase)
- [ ] Tests de switch company (socket cleanup, re-authentication)
- [ ] Tests de deletion building (RDODelFacility)
- [ ] Tests de rename building (Set Name)
- [ ] Tests d'upgrade/downgrade (RDOStartUpgrades, RDOStopUpgrade, RDODowngrade)

### Bénéfices mesurables

| Métrique | Avant | Après tests RDO |
|----------|-------|-----------------|
| Temps pour détecter bug protocole | 30-60 min (test manuel) | <1 sec (test auto) |
| Confiance lors refactor | Faible (peur de casser) | Haute (tests valident) |
| Onboarding nouveaux devs | 2-3 jours (lire code) | 1 jour (lire tests) |
| Couverture protocole | 0% | 80%+ |

### Recommandation

**Commencer par les flux critiques:**
1. Login flow (3-4 tests)
2. Company selection (2-3 tests)
3. Building focus (2-3 tests)

**Puis étendre progressivement:**
- Propriétés buildings (5-10 tests)
- Construction routes (5-10 tests)
- Switch company (3-5 tests)

**Critères de succès:**
- ✅ Chaque commande RDO a au moins 1 test de format
- ✅ Chaque parsing de réponse a au moins 1 test
- ✅ Les cas d'erreur sont couverts
- ✅ Les tests passent en <5 secondes

### Conclusion

L'intégration de tests RDO avec simulation est **essentielle** pour:
- Maintenir la compatibilité protocole lors des mises à jour
- Détecter les régressions immédiatement
- Accélérer le développement (pas besoin du vrai serveur)
- Documenter le protocole de manière executable

**Priorité: HAUTE** - À implémenter après la stabilisation des features actuelles.
