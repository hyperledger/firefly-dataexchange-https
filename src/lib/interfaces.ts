// Copyright © 2021 Kaleido, Inc.
//
// SPDX-License-Identifier: Apache-2.0
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

export interface IConfig {
  api: {
    hostname: string
    port: number
  }
  p2p: {
    hostname: string
    port: number
    endpoint?: string
  }
  apiKey?: string
  peers: {
    id: string
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
  id: string
  type: 'message-received'
  sender: string
  message: string
}

export interface IMessageDeliveredEvent {
  id: string
  type: 'message-delivered'
  recipient: string
  message: string
}

export interface IMessageFailedEvent {
  id: string
  type: 'message-failed'
  recipient: string
  message: string
  requestID?: string
}

export interface IBlobReceivedEvent {
  id: string
  type: 'blob-received'
  sender: string
  path: string
  hash: string
}

export interface IBlobDeliveredEvent {
  id: string
  type: 'blob-delivered'
  recipient: string
  path: string
}

export interface IBlobFailedEvent {
  id: string
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
  requestID?: string
  message: string
  recipient: string
  recipientURL: string
}

export type BlobTask = {
  requestID?: string
  blobPath: string
  recipient: string
  recipientURL: string
}

export interface IStatus {
  messageQueueSize: number
  peers: {
    id: string
    endpoint: string
    available: boolean
  }[]
}

export interface ICertData {
  organization?: string
  organizationUnit?: string
}

export interface IMetadata {
  hash: string
  lastUpdate: number
}