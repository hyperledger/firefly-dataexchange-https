import { AxiosRequestConfig } from "axios"
import FormData from "form-data"

export interface IConfig {
  apiPort: number
  p2pPort: number
  apiKey: string
  peers: {
    name: string
    endpoint: string
  }[]
}

export interface IFile {
  key: string
  name: string
  readableStream: NodeJS.ReadableStream
}

export type OutboundEvent =
  IMessageReceivedEvent |
  IMessageDeliveredEvent |
  IMessageFailedEvent |
  IBlobReceivedEvent |
  IBlobDeliveredEvent |
  IBlobFailedEvent

export interface IMessageReceivedEvent {
  type: 'message-received'
  sender: string
  message: string
}

export interface IMessageDeliveredEvent {
  type: 'message-delivered'
  recipient: string
  message: string
}

export interface IMessageFailedEvent {
  type: 'message-failed'
  recipient: string
  message: string
}

export interface IBlobReceivedEvent {
  type: 'blob-received'
  sender: string
  path: string
  hash: string
}

export interface IBlobDeliveredEvent {
  type: 'blob-delivered'
  recipient: string
  path: string
}

export interface IBlobFailedEvent {
  type: 'blob-failed'
  recipient: string
  path: string
}

export type InboundEvent =
  IMessageEvent |
  ICommitEvent

export interface IMessageEvent {
  type: 'message'
  recipient: string
  message: string
}

export interface ICommitEvent {
  type: 'commit'
}

export type MessageTask = {
  message: string
  recipient: string
  recipientURL: string
}

export type BlobTask = {
  blobPath: string
  recipient: string
  recipientURL: string
}

export interface IStatus {
  messageQueueSize: number
  peers: {
    name: string
    available: boolean
  }[]
}
