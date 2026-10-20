/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { bytesDesdeBase64 } from './crypto';
import {
  credencialDesdeFrase,
  DICCIONARIO,
  elegirFraseAleatoria,
  esFraseValida,
  normalizarFrase,
  PALABRAS_POR_FRASE,
} from './mnemonic';

describe('mnemonic: diccionario (K-9)', () => {
  it('tiene exactamente 128 palabras únicas, sin tildes ni espacios', () => {
    expect(DICCIONARIO).toHaveLength(128);
    expect(new Set(DICCIONARIO).size).toBe(128);
    DICCIONARIO.forEach((palabra) => {
      expect(palabra).toMatch(/^[a-z]+$/);
    });
  });
});

describe('mnemonic: elegir y validar frase', () => {
  it('elegirFraseAleatoria regresa 6 palabras del diccionario separadas por guion', () => {
    const frase = elegirFraseAleatoria();
    const palabras = frase.split('-');
    expect(palabras).toHaveLength(PALABRAS_POR_FRASE);
    palabras.forEach((palabra) => {
      expect(DICCIONARIO).toContain(palabra);
    });
  });

  it('esFraseValida acepta la frase generada y rechaza formas inválidas', () => {
    const frase = elegirFraseAleatoria();
    expect(esFraseValida(frase)).toBe(true);

    expect(esFraseValida('')).toBe(false);
    expect(esFraseValida('faro-sol-luz')).toBe(false); // 3 palabras
    expect(esFraseValida(`${frase}-faro`)).toBe(false); // 7 palabras
    expect(esFraseValida('faro-sol-luz-mar-nube-cielo-xilofono')).toBe(false); // palabra fuera del diccionario
  });

  it('normalizarFrase limpia mayúsculas, tildes, comas y espacios múltiples', () => {
    expect(normalizarFrase('  Arbol    FARO,  Sol-Luz ')).toBe('arbol-faro-sol-luz');
    expect(normalizarFrase('Árbol candil súnion')).toBe('arbol-candil-sunion');
  });

  it('una frase válida con mayúsculas/tildes/espacios se acepta tras normalizar', () => {
    const frase = elegirFraseAleatoria();
    const conEspacios = frase.split('-').join(' ');
    const conComas = frase.split('-').join(', ');

    expect(esFraseValida(frase)).toBe(true);
    expect(esFraseValida(conEspacios)).toBe(true);
    expect(esFraseValida(conComas)).toBe(true);
  });
});

describe('mnemonic: credencial determinista desde frase (esquema Teacher-Buddy)', () => {
  it('misma frase (aún con variaciones de escritura) → misma credencial', async () => {
    const frase = elegirFraseAleatoria();
    const limpia = await credencialDesdeFrase(frase);
    const conEspacios = await credencialDesdeFrase(frase.split('-').join(' '));
    const conComas = await credencialDesdeFrase(frase.split('-').join(','));

    expect(conEspacios.vaultId).toBe(limpia.vaultId);
    expect(conEspacios.secretKey).toBe(limpia.secretKey);
    expect(conComas.secretKey).toBe(limpia.secretKey);
  });

  it('vaultId con formato vlt_<12 hex> y secretKey de exactamente 256 bits', async () => {
    const credencial = await credencialDesdeFrase(elegirFraseAleatoria());

    expect(credencial.vaultId).toMatch(/^vlt_[0-9a-f]{12}$/);
    expect(bytesDesdeBase64(credencial.secretKey)).toHaveLength(32);
  });

  it('frases distintas producen credenciales distintas (sin colisión práctica)', async () => {
    const a = await credencialDesdeFrase('faro-sol-luz-rosa-nube-cielo');
    const b = await credencialDesdeFrase('arbol-danza-eco-faro-sol-luz');
    expect(a.vaultId).not.toBe(b.vaultId);
    expect(a.secretKey).not.toBe(b.secretKey);
  });

  it('rechaza frases inválidas con mensaje claro en español', async () => {
    await expect(credencialDesdeFrase('faro-sol-luz')).rejects.toThrow('6 palabras del diccionario');
    await expect(credencialDesdeFrase('faro-sol-luz-mar-nube-xyz')).rejects.toThrow('6 palabras');
  });
});
