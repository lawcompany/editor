import './pako-types'
import { Buffer } from './bytes'
import { deflateRaw, inflateRaw } from 'pako'
import { sha1 } from '@noble/hashes/legacy.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { buf } from 'crc-32'

export const deflateRawSync = (data: Uint8Array): Buffer => Buffer.from(deflateRaw(data))
export const inflateRawSync = (data: Uint8Array): Buffer => Buffer.from(inflateRaw(data))
export const crc32 = (data: Uint8Array): number => buf(data) >>> 0
export const digest = (data: Uint8Array): string => bytesToHex(sha1(data))
