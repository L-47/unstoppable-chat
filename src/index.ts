import Gun from 'gun';
import Sea from 'gun/sea';
import 'gun/lib/not.js';
import { EventEmitter } from 'events';

(Gun as any).SEA = Sea;

interface Admin {
  pubKey: string;
  name: string;
}

interface Contact {
  pubKey: string;
  alias: string;
  name: string;
  notifCount?: number;
}

interface Peer {
  disabled?: boolean;
  joined?: boolean;
  alias: string;
  pubKey?: string;
  name?: string;
}

interface Peers {
  [pubKey: string]: Peer;
}

interface Announcement extends Channel {
  admins: { [pubKey: string]: Admin | 'disabled' };
  owner: string;
}

interface Channel {
  key: string;
  name: string;
  userCount: number;
  latestMsg: null | string;
  peers: Peers;
  pair: unknown;
  notifCount?: number;
}

interface Message {
  time: number;
  msg: unknown;
  owner: string;
  userPub?: string;
  peerInfo?: string;
}

interface Events {
  channels: Channel[];
  channelInvites: Channel[];
  channelMessages: Message[];
  contacts: Contact[];
  contactInvites: Contact[];
  contactMessages: Message[];
  announcements: Announcement[];
  announcementInvites: Announcement[];
  announcementMessages: Message[];
}

interface TypedEventEmitter<T> {
  on<K extends keyof T>(s: K, listener: (v: T[K]) => void);
  emit<K extends keyof T>(s: K, param: T[K]);
}

export default class UnstoppableChat {
  gun: any;
  publicName: string | null;
  contactsList: Contact[];
  contactInvitesList: Contact[];
  channelsList: Channel[];
  channelInvitesList: Channel[];
  announcementsList: Announcement[];
  announcementInvitesList: Announcement[];
  activeContact: string | null;
  activeChannel: string | null;
  activeAnnouncement: string | null;
  emitter: TypedEventEmitter<Events>;

  constructor(superpeers: string[]) {
    this.gun = new Gun(superpeers);
    this.publicName = null;
    this.contactsList = [];
    this.contactInvitesList = [];
    this.channelsList = [];
    this.channelInvitesList = [];
    this.announcementsList = [];
    this.announcementInvitesList = [];
    this.activeContact = null;
    this.activeChannel = null;
    this.activeAnnouncement = null;
    this.emitter = new EventEmitter();
  }

  async validatePubKeyFromUsername(
    username: string,
    pubKey: string,
  ): Promise<void> {
    const gun = this.gun;
    let verified = false;
    return new Promise((resolve, reject) => {
      gun.get(`~@${username}`).once((peerByUsername) => {
        Object.keys(peerByUsername._['>']).forEach((uPub) => {
          if (uPub.substr(1) === pubKey) {
            verified = true;
            resolve();
          }
        });
        if (!verified) {
          reject('Cannot validate pubkey from username');
        }
      });
    });
  }

  async join(username: string, password: string, publicName: string) {
    const gun = this.gun;
    return new Promise((resolve) => {
      gun.on('auth', () => {
        gun.user().get('name').put(publicName);
        gun.user().get('epub').put(gun.user()._.sea.epub);
        this.publicName = publicName;
        resolve();
      });
      gun.user().recall({ sessionStorage: true });
      gun.user().auth(username, password);
    });
  }

  async reset() {
    const gun = this.gun;
    gun
      .user()
      .get('pchat')
      .once((pubKeys) => {
        if (!pubKeys) return;
        Object.keys(pubKeys).forEach((pubKey) => {
          gun.user().get('pchat').get(pubKey).put({ disabled: true });
        });
      });
    gun
      .user()
      .get('contacts')
      .once((pubKeys) => {
        if (!pubKeys) return;
        Object.keys(pubKeys).forEach((pubKey) => {
          gun.user().get('contacts').get(pubKey).put({ disabled: true });
        });
      });
    gun
      .user()
      .get('pchannel')
      .once((chanKeys) => {
        if (!chanKeys) return;
        Object.keys(chanKeys).forEach((chanKey) => {
          gun.user().get('pchannel').get(chanKey).put({ disabled: true });
        });
      });
    gun
      .get(gun.user()._.sea.pub)
      .get('invites')
      .get('contacts')
      .once((pubKeys) => {
        if (!pubKeys) return;
        Object.keys(pubKeys).forEach((pubKey) => {
          gun
            .get(gun.user()._.sea.pub)
            .get('invites')
            .get('contacts')
            .get(pubKey)
            .put({ disabled: true });
        });
      });
    gun
      .get(gun.user()._.sea.pub)
      .get('invites')
      .get('pchannel')
      .once((pubKeys) => {
        if (!pubKeys) return;
        Object.keys(pubKeys).forEach((pubKey) => {
          gun
            .get(gun.user()._.sea.pub)
            .get('invites')
            .get('pchannel')
            .get(pubKey)
            .once((chanKeys) => {
              if (!chanKeys) return;
              Object.keys(chanKeys).forEach((chanKey) => {
                gun
                  .get(gun.user()._.sea.pub)
                  .get('invites')
                  .get('pchannel')
                  .get(pubKey)
                  .get(chanKey)
                  .put('disabled');
              });
            });
        });
      });
    gun
      .get('pchat')
      .get(gun.user().is.pub)
      .once((pubKeys) => {
        if (!pubKeys) return;
        Object.keys(pubKeys).forEach((pubKey) => {
          gun.get('pchat').get(gun.user().is.pub).get(pubKey).put('disabled');
        });
      });
  }

  async logout() {
    const gun = this.gun;
    gun.user().leave();
  }

  async addContact(username: string, pubKey: string, publicName: string) {
    const gun = this.gun;
    await this.validatePubKeyFromUsername(username, pubKey);
    gun.user().get('contacts').get(pubKey).put({
      pubKey,
      alias: username,
      name: publicName,
      disabled: false,
    });
    gun.get(pubKey).get('invites').get('contacts').get(gun.user().is.pub).put({
      pubKey: gun.user().is.pub,
      alias: gun.user().is.alias,
      name: this.publicName,
      disabled: false,
    });
  }

  removeContact(pubKey: string) {
    const gun = this.gun;
    gun.user().get('contacts').get(pubKey).put({ disabled: true });
  }

  async loadContacts() {
    const gun = this.gun;
    const contactsList = this.contactsList;
    const loadedContacts = {};
    gun
      .user()
      .get('contacts')
      .not((key) => {
        this.emitter.emit('contacts', contactsList);
      });
    gun
      .user()
      .get('contacts')
      .on((contacts) => {
        if (!contacts) {
          return;
        }
        Object.keys(contacts).forEach((pubKey) => {
          if (pubKey === '_' || pubKey === 'null') {
            return;
          }
          gun
            .user()
            .get('contacts')
            .get(pubKey)
            .on((contact) => {
              if (
                !contact ||
                (contact &&
                  contact.name &&
                  !contact.disabled &&
                  loadedContacts[pubKey])
              )
                return;
              if (contact.disabled && loadedContacts[pubKey]) {
                const index = contactsList.map((c) => c.pubKey).indexOf(pubKey);
                contactsList.splice(index, 1);
                loadedContacts[pubKey] = false;
              } else if (
                !contact.disabled &&
                contact.name &&
                !loadedContacts[pubKey]
              ) {
                loadedContacts[pubKey] = true;
                const contactIndex = contactsList.length;
                contactsList.push({
                  pubKey: contact.pubKey,
                  alias: contact.alias,
                  name: contact.name,
                });
                gun
                  .get('pchat')
                  .get(gun.user().is.pub)
                  .get(contact.pubKey)
                  .get('new')
                  .on((newMsgs) => {
                    if (!newMsgs) return;
                    let newCount = 0;
                    Object.keys(newMsgs).forEach((time) => {
                      if (
                        time === '_' ||
                        time === 'disabled' ||
                        !newMsgs[time] ||
                        newMsgs[time] === 'disabled'
                      )
                        return;
                      newCount += 1;
                    });
                    contactsList[contactIndex].notifCount = newCount;
                    this.emitter.emit('contacts', contactsList);
                  });
              }
              this.emitter.emit('contacts', contactsList);
            });
        });
      });
  }

  async loadContactInvites() {
    if (!this.gun.user().is) {
      return;
    }
    const gun = this.gun;
    const invitesList = this.contactInvitesList;
    const loadedInvites = {};
    gun
      .get(gun.user()._.sea.pub)
      .get('invites')
      .get('contacts')
      .not((key) => {
        this.emitter.emit('contactInvites', invitesList);
      });
    gun
      .get(gun.user()._.sea.pub)
      .get('invites')
      .get('contacts')
      .on(async (contacts) => {
        Object.keys(contacts).forEach((pubKey) => {
          if (pubKey === '_' || pubKey === 'null') return;
          gun
            .get(gun.user()._.sea.pub)
            .get('invites')
            .get('contacts')
            .get(pubKey)
            .on((contact) => {
              if (
                !contact ||
                (contact &&
                  contact.name &&
                  !contact.disabled &&
                  loadedInvites[contact.pubKey])
              )
                return;
              if (contact.disabled && loadedInvites[pubKey]) {
                const index = invitesList.map((c) => c.pubKey).indexOf(pubKey);
                invitesList.splice(index, 1);
                loadedInvites[pubKey] = false;
              } else if (
                contact.name &&
                !contact.disabled &&
                !loadedInvites[pubKey]
              ) {
                loadedInvites[contact.pubKey] = true;
                invitesList.push({
                  name: contact.name,
                  pubKey: contact.pubKey,
                  alias: contact.alias,
                });
              }
              this.emitter.emit('contactInvites', invitesList);
            });
        });
      });
  }

  async acceptContactInvite(
    username: string,
    pubKey: string,
    publicName: string,
  ) {
    const gun = this.gun;
    await this.validatePubKeyFromUsername(username, pubKey);
    gun.user().get('contacts').get(pubKey).put({
      pubKey,
      alias: username,
      name: publicName,
      disabled: false,
    });
    gun
      .get(gun.user()._.sea.pub)
      .get('invites')
      .get('contacts')
      .get(pubKey)
      .put({ disabled: true });
  }

  async denyContactInvite(pubKey: string) {
    const gun = this.gun;
    gun
      .get(gun.user()._.sea.pub)
      .get('invites')
      .get('contacts')
      .get(pubKey)
      .put({ disabled: true });
  }

  async sendMessageToContact(pubKey: string, msg: string) {
    const gun = this.gun;
    if (msg.length < 1) {
      return;
    }
    const time = Date.now();
    const otherPeer = await gun.user(pubKey);
    let otherPeerEpub = otherPeer.epub;
    if (otherPeer.epub[2] === ':') {
      otherPeerEpub = JSON.parse(otherPeer.epub)[':'];
    }
    const sec = await (Gun.SEA as any).secret(otherPeerEpub, gun.user()._.sea);
    const encMsg = await Gun.SEA.encrypt(msg, sec);
    gun
      .user()
      .get('pchat')
      .get(pubKey)
      .get(time)
      .put(
        JSON.stringify({
          msg: encMsg,
          time,
        }),
      );
    gun
      .get('pchat')
      .get(pubKey)
      .get(gun.user().is.pub)
      .get('new')
      .get(time)
      .put(
        JSON.stringify({
          msg: encMsg,
          time,
        }),
      );
    gun
      .get('pchat')
      .get(pubKey)
      .get(gun.user().is.pub)
      .get('latest')
      .put(
        JSON.stringify({
          msg: JSON.stringify(encMsg),
          time,
        }),
      );
    gun
      .get('pchat')
      .get(gun.user().is.pub)
      .get(pubKey)
      .get('latest')
      .put(
        JSON.stringify({
          msg: JSON.stringify(encMsg),
          time,
        }),
      );
  }

  async loadMessagesOfContact(pubKey: string, publicName: string) {
    const gun = this.gun;
    this.activeContact = pubKey;
    this.activeChannel = null;
    const thisChat = this;
    const loadedMsgs = {};
    const loadedMsgsList: Message[] = [];
    const otherPeer = await gun.user(pubKey);
    let otherPeerEpub = otherPeer.epub;
    if (otherPeer.epub[2] === ':') {
      otherPeerEpub = JSON.parse(otherPeer.epub)[':'];
    }
    async function loadMsgsOf(path, name, emitter) {
      path.not((key) => {
        emitter.emit('contactMessages', loadedMsgsList);
      });
      path.on((msgs) => {
        if (!msgs) return;
        Object.keys(msgs).forEach((time) => {
          if (loadedMsgs[time]) return;
          path.get(time).on(async (msgDataString) => {
            if (
              thisChat.activeContact !== pubKey ||
              !msgDataString ||
              msgDataString === 'null' ||
              loadedMsgs[time]
            )
              return;
            loadedMsgs[time] = true;
            let msgData = msgDataString;
            if (typeof msgDataString === 'string') {
              msgData = JSON.parse(msgDataString);
            }
            if (!msgData || !msgData.msg) return;
            if (typeof msgData.msg === 'string') {
              msgData.msg = JSON.parse(
                msgData.msg.substr(3, msgData.msg.length),
              );
            }
            const sec = await (Gun.SEA as any).secret(
              otherPeerEpub,
              gun.user()._.sea,
            );
            const decMsg = await Gun.SEA.decrypt(msgData.msg, sec);
            if (!decMsg) return;
            loadedMsgsList.push({
              time: msgData.time,
              msg: decMsg,
              owner: name,
            });
            loadedMsgsList.sort((a, b) => a.time - b.time);
            gun
              .get('pchat')
              .get(gun.user().is.pub)
              .get(pubKey)
              .get('new')
              .get(msgData.time)
              .put('disabled');
            emitter.emit('contactMessages', loadedMsgsList);
          });
        });
      });
    }
    loadMsgsOf(
      gun.user().get('pchat').get(pubKey),
      this.publicName,
      this.emitter,
    );
    loadMsgsOf(
      gun.user(pubKey).get('pchat').get(gun.user()._.sea.pub),
      publicName,
      this.emitter,
    );
  }

  async createChannel(channelName: string) {
    const gun = this.gun;
    const channelPair = await (Gun.SEA as any).pair();
    const channelKey = channelPair.epub;
    const sec = await (Gun.SEA as any).secret(channelKey, gun.user()._.sea);
    const encPair = await Gun.SEA.encrypt(JSON.stringify(channelPair), sec);
    gun.user().get('pchannel').get(channelKey).put({
      pair: encPair,
      name: channelName,
      key: channelKey,
    });
    gun
      .user()
      .get('pchannel')
      .get(channelKey)
      .get('peers')
      .get(gun.user().is.pub)
      .put(
        JSON.stringify({
          alias: gun.user().is.alias,
          name: this.publicName,
          joined: true,
          disabled: false,
        }),
      );
  }

  leaveChannel(channel: Channel) {
    const gun = this.gun;
    const leaveMsg = `${this.publicName} has left the chat.`;
    this.sendMessageToChannel(channel, leaveMsg, {
      pubKey: gun.user().is.pub,
      alias: gun.user().is.alias,
      name: this.publicName,
      action: 'leave',
    });
    gun.user().get('pchannel').get(channel.key).put({ disabled: true });
  }

  async loadChannels() {
    const gun = this.gun;
    const loadedChannels = {};
    const loadedChannelsList = this.channelsList;
    gun
      .user()
      .get('pchannel')
      .not((key) => {
        this.emitter.emit('channels', loadedChannelsList);
      });
    gun
      .user()
      .get('pchannel')
      .on(async (channels) => {
        if (!channels) {
          return;
        }
        Object.keys(channels).forEach(async (channelKey) => {
          if (channelKey === '_' || loadedChannels[channelKey]) {
            return;
          }
          (Gun.SEA as any).secret(channelKey, gun.user()._.sea, (sec) => {
            gun
              .user()
              .get('pchannel')
              .get(channelKey)
              .on((channel) => {
                if (
                  !channel ||
                  !channel.key ||
                  (channel &&
                    channel.key &&
                    !channel.disabled &&
                    loadedChannels[channelKey])
                )
                  return;
                if (channel.disabled && loadedChannels[channelKey]) {
                  const index = loadedChannelsList
                    .map((c) => c.key)
                    .indexOf(channelKey);
                  loadedChannelsList.splice(index, 1);
                  loadedChannels[channelKey] = false;
                  this.emitter.emit('channels', loadedChannelsList);
                } else if (
                  !channel.disabled &&
                  channel.name &&
                  !loadedChannels[channelKey]
                ) {
                  const loadedPeers: Peers = {};
                  gun
                    .user()
                    .get('pchannel')
                    .get(channelKey)
                    .get('peers')
                    .once(async (peers) => {
                      if (!peers || loadedChannels[channelKey]) return;
                      loadedChannels[channelKey] = true;
                      const pair = await Gun.SEA.decrypt(channel.pair, sec);
                      const loadedChannelIndex = loadedChannelsList.length;
                      loadedChannelsList.push({
                        key: channelKey,
                        name: channel.name,
                        userCount: 0,
                        latestMsg: null,
                        peers: loadedPeers,
                        pair,
                      });
                      this.emitter.emit('channels', loadedChannelsList);
                      Object.keys(peers).forEach((pubKey) => {
                        if (pubKey === '_' || loadedPeers[pubKey]) return;
                        gun
                          .user()
                          .get('pchannel')
                          .get(channelKey)
                          .get('peers')
                          .get(pubKey)
                          .once((peerData) => {
                            if (
                              !peerData ||
                              peerData.disabled ||
                              loadedPeers[pubKey]
                            )
                              return;
                            loadedPeers[pubKey] = peerData;
                            loadedChannelsList[
                              loadedChannelIndex
                            ].peers = loadedPeers;
                            this.emitter.emit('channels', loadedChannelsList);
                          });
                      });
                      gun
                        .get('pchannel')
                        .get(channelKey)
                        .get('peers')
                        .get(gun.user().is.pub)
                        .get('new')
                        .on((newMsgs) => {
                          if (!newMsgs) return;
                          let newCount = 0;
                          Object.keys(newMsgs).forEach((time) => {
                            if (
                              time === '_' ||
                              time === 'disabled' ||
                              !newMsgs[time] ||
                              newMsgs[time] === 'disabled'
                            ) {
                              return;
                            }
                            newCount += 1;
                          });
                          if (loadedChannelsList[loadedChannelIndex]) {
                            loadedChannelsList[
                              loadedChannelIndex
                            ].notifCount = newCount;
                          }
                          this.emitter.emit('channels', loadedChannelsList);
                        });
                    });
                }
              });
          });
        });
      });
  }

  async inviteToChannel(
    channel: Channel,
    username: string,
    peerPubKey: string,
    publicName: string,
  ) {
    if (!this.gun.user().is) {
      return;
    }
    const gun = this.gun;
    await this.validatePubKeyFromUsername(username, peerPubKey);
    const otherPeer = await gun.user(peerPubKey);
    let otherPeerEpub = otherPeer.epub;
    if (otherPeer.epub[2] === ':') {
      otherPeerEpub = JSON.parse(otherPeer.epub)[':'];
    }
    const inviteSec = await (Gun.SEA as any).secret(
      otherPeerEpub,
      gun.user()._.sea,
    );
    const eInvitePair = await Gun.SEA.encrypt(
      JSON.stringify(channel.pair),
      inviteSec,
    );
    const channelInvite = { ...channel, peerName: this.publicName };
    channelInvite.pair = eInvitePair;
    gun
      .get(peerPubKey)
      .get('invites')
      .get('pchannel')
      .get(gun.user()._.sea.pub)
      .get(channel.key)
      .put(JSON.stringify(channelInvite));
    this.sendMessageToChannel(channel, `${publicName} has been invited.`, {
      pubKey: peerPubKey,
      alias: username,
      name: publicName,
      action: 'invited',
    });
    gun
      .user()
      .get('pchannel')
      .get(channel.key)
      .get('peers')
      .get(peerPubKey)
      .put(
        JSON.stringify({
          alias: username,
          name: publicName,
          joined: false,
          disabled: false,
        }),
      );
  }

  async loadChannelInvites() {
    if (!this.gun.user().is) {
      return;
    }
    const gun = this.gun;
    const loadedInvites = {};
    const loadedInvitesList = this.channelInvitesList;
    gun
      .get(gun.user()._.sea.pub)
      .get('invites')
      .get('pchannel')
      .not((key) => {
        this.emitter.emit('channelInvites', loadedInvitesList);
      });
    gun
      .get(gun.user()._.sea.pub)
      .get('invites')
      .get('pchannel')
      .on(async (peerInvites) => {
        if (!peerInvites) return;
        Object.keys(peerInvites).forEach((peerPub) => {
          if (peerPub === '_') return;
          gun
            .get(gun.user()._.sea.pub)
            .get('invites')
            .get('pchannel')
            .get(peerPub)
            .on(async (channels) => {
              if (!channels || channels === 'disabled') return;
              Object.keys(channels).forEach(async (channelKey) => {
                const channel =
                  typeof channels[channelKey] === 'string' &&
                  channels[channelKey] !== 'disabled'
                    ? JSON.parse(channels[channelKey])
                    : channels[channelKey];
                if (
                  channelKey === '_' ||
                  !channel ||
                  (channel && channel.key && loadedInvites[channelKey])
                )
                  return;
                if (channel === 'disabled' && loadedInvites[channelKey]) {
                  const index = loadedInvitesList
                    .map((c) => c.key)
                    .indexOf(channelKey);
                  loadedInvitesList.splice(index, 1);
                  loadedInvites[channelKey] = false;
                } else if (channel.key && !loadedInvites[channelKey]) {
                  loadedInvites[channelKey] = channelKey;
                  const peerKeys = await gun.user(peerPub).then();
                  const peerEpub = peerKeys ? peerKeys.epub : null;
                  const sec = await (Gun.SEA as any).secret(
                    peerEpub,
                    gun.user()._.sea,
                  );
                  if (typeof channel.pair === 'string') {
                    channel.pair = JSON.parse(
                      channel.pair.substr(3, channel.pair.length),
                    );
                  }
                  channel.pair = await Gun.SEA.decrypt(channel.pair, sec);
                  channel.peerPub = peerPub;
                  channel.peerAlias = peerKeys.alias;
                  channel.key = channelKey;
                  loadedInvitesList.push(channel);
                }
                this.emitter.emit('channelInvites', loadedInvitesList);
              });
            });
        });
      });
  }

  async acceptChannelInvite(
    invite: Channel & {
      peerPub: string;
      peerAlias: string;
      peerName: string;
    },
  ) {
    const gun = this.gun;
    gun
      .user()
      .get('pchannel')
      .get(invite.key)
      .get('peers')
      .get(gun.user().is.pub)
      .put(
        JSON.stringify({
          alias: gun.user().is.alias,
          name: this.publicName,
          joined: true,
          key: invite.key,
          peerPub: invite.peerPub,
        }),
      );
    gun
      .user()
      .get('pchannel')
      .get(invite.key)
      .get('peers')
      .get(invite.peerPub)
      .put(
        JSON.stringify({
          alias: invite.peerAlias,
          name: invite.peerName,
          joined: true,
          key: invite.key,
          peerPub: invite.peerPub,
        }),
      );
    const sec = await (Gun.SEA as any).secret(invite.key, gun.user()._.sea);
    const encPair = await Gun.SEA.encrypt(invite.pair, sec);
    gun.user().get('pchannel').get(invite.key).put({
      pair: encPair,
      name: invite.name,
      key: invite.key,
      disabled: false,
    });
    const loadedPeers = {};
    Object.keys(invite.peers).forEach((pubKey) => {
      if (pubKey === '_') return;
      const peer = invite.peers[pubKey];
      if (loadedPeers[pubKey] || !peer || peer.disabled) return;
      loadedPeers[pubKey] = pubKey;
      gun
        .user()
        .get('pchannel')
        .get(invite.key)
        .get('peers')
        .get(pubKey)
        .put(JSON.stringify(peer));
    });
    gun
      .get(gun.user()._.sea.pub)
      .get('invites')
      .get('pchannel')
      .get(invite.peerPub)
      .get(invite.key)
      .put('disabled');
    const channel = invite;
    if (!channel.peers[gun.user().is.pub]) {
      channel.peers[gun.user().is.pub] = { alias: gun.user().is.alias };
    }
    channel.peers[gun.user().is.pub].joined = true;
    const joinMsg = `${this.publicName} has joined the chat!`;
    this.sendMessageToChannel(channel, joinMsg, {
      pubKey: gun.user().is.pub,
      alias: gun.user().is.alias,
      name: this.publicName,
      action: 'join',
    });
    const inviteIndex = this.channelInvitesList.findIndex(
      (c) => c.key === invite.key,
    );
    this.channelInvitesList.splice(inviteIndex, 1);
  }

  async denyChannelInvite(invite: { peerPub: string; key: string }) {
    const gun = this.gun;
    gun
      .get(gun.user()._.sea.pub)
      .get('invites')
      .get('pchannel')
      .get(invite.peerPub)
      .get(invite.key)
      .put('disabled');
  }

  async sendMessageToChannel(channel: Channel, msg: string, peerInfo) {
    if (!msg) {
      return;
    }
    const gun = this.gun;
    const time = Date.now();
    const sec = await (Gun.SEA as any).secret(channel.key, channel.pair);
    const encMsg = await Gun.SEA.encrypt(msg, sec);
    const channelChatToSend = gun
      .user()
      .get('pchannel')
      .get(channel.key)
      .get('chat');
    channelChatToSend.get(time).put(
      JSON.stringify({
        msg: encMsg,
        userPub: gun.user().is.pub,
        userName: this.publicName,
        time,
        peerInfo,
      }),
    );
    gun.get('pchannel').get(channel.key).get('latest').put({
      msg: encMsg,
      user: gun.user().is.pub,
      time,
      peerInfo,
    });
    if (!channel.peers) return;
    Object.keys(channel.peers).forEach((pubKey) => {
      if (
        pubKey !== '_' &&
        channel.peers[pubKey] &&
        pubKey !== gun.user().is.pub
      ) {
        gun
          .get('pchannel')
          .get(channel.key)
          .get('peers')
          .get(pubKey)
          .get('new')
          .get(time)
          .put(
            JSON.stringify({
              msg: encMsg,
              user: gun.user().is.pub,
              time,
            }),
          );
      }
    });
  }

  async loadMessagesOfChannel(channel: Channel) {
    const gun = this.gun;
    this.activeChannel = channel.key;
    this.activeContact = null;
    const thisChat = this;
    const channelKey = channel.key;
    const loadedMsgsList: Message[] = [];
    const loadedMsgs = {};
    const channelSec = await (Gun.SEA as any).secret(channel.key, channel.pair);
    async function loadMsgsOf(path, name, emitter) {
      path.not((key) => {
        emitter.emit('channelMessages', loadedMsgsList);
      });
      path.on((peerMsgs) => {
        if (!peerMsgs) return;
        Object.keys(peerMsgs).forEach((time) => {
          if (loadedMsgs[time + name] || time === '_') return;
          path.get(time).on(async (msgDataString) => {
            if (
              thisChat.activeChannel !== channel.key ||
              loadedMsgs[time + name]
            )
              return;
            loadedMsgs[time + name] = true;
            let msgData = msgDataString;
            if (typeof msgDataString === 'string') {
              msgData = JSON.parse(msgDataString);
            }
            if (typeof msgData.msg === 'string') {
              msgData.msg = JSON.parse(
                msgData.msg.substr(3, msgData.msg.length),
              );
            }
            const decMsg = await Gun.SEA.decrypt(msgData.msg, channelSec);
            if (!msgData || !msgData.msg || !decMsg || !msgData.userPub) return;
            if (msgData.peerInfo) {
              if (typeof msgData.peerInfo === 'string') {
                msgData.peerInfo = JSON.parse(msgData.peerInfo);
              }
              if (msgData.peerInfo.action === 'join') {
                channel.peers[msgData.peerInfo.pubKey] = {
                  alias: msgData.peerInfo.alias,
                  pubKey: msgData.peerInfo.pubKey,
                  name: msgData.peerInfo.name,
                  joined: true,
                  disabled: false,
                };
                gun
                  .user()
                  .get('pchannel')
                  .get(channelKey)
                  .get('peers')
                  .get(msgData.peerInfo.pubKey)
                  .put(JSON.stringify(channel.peers[msgData.peerInfo.pubKey]));
              } else if (msgData.peerInfo.action === 'leave') {
                gun
                  .user()
                  .get('pchannel')
                  .get(channel.key)
                  .get('peers')
                  .get(msgData.peerInfo.pubKey)
                  .put('disabled');
              } else if (msgData.peerInfo.action === 'invited') {
                const peerObj = {
                  alias: msgData.peerInfo.alias,
                  pubKey: msgData.peerInfo.pubKey,
                  name: msgData.peerInfo.name,
                  disabled: false,
                };
                if (channel.peers[msgData.peerInfo.pubKey]) {
                  (peerObj as any).joined =
                    channel.peers[msgData.peerInfo.pubKey].joined;
                }
                gun
                  .user()
                  .get('pchannel')
                  .get(channelKey)
                  .get('peers')
                  .get(msgData.peerInfo.pubKey)
                  .put(JSON.stringify(peerObj));
              }
            }
            loadedMsgsList.push({
              time: msgData.time,
              userPub: msgData.userPub,
              owner: name,
              msg: decMsg,
              peerInfo: msgData.peerInfo,
            });
            loadedMsgsList.sort((a, b) => a.time - b.time);
            gun
              .get('pchannel')
              .get(channel.key)
              .get('peers')
              .get(gun.user().is.pub)
              .get('new')
              .get(msgData.time)
              .put('disabled');
            emitter.emit('channelMessages', loadedMsgsList);
          });
        });
      });
    }
    const loadedPeers = {};
    gun
      .user()
      .get('pchannel')
      .get(channel.key)
      .get('peers')
      .on((peers) => {
        Object.keys(peers).forEach((pubKey) => {
          if (
            pubKey === '_' ||
            !peers[pubKey] ||
            typeof peers[pubKey] !== 'string'
          )
            return;
          let peer;
          if (peers[pubKey] !== 'disabled') {
            peer = JSON.parse(peers[pubKey]);
            if (typeof peer === 'string') {
              peer = JSON.parse(peer);
            }
          } else if (peers[pubKey] === 'disabled' && loadedPeers[pubKey]) {
            delete channel.peers[pubKey];
            loadedPeers[pubKey] = false;
            return;
          }
          const peerChannelChatPath = gun
            .user(pubKey)
            .get('pchannel')
            .get(channelKey)
            .get('chat');
          if (
            !peer ||
            !peer.name ||
            (peer.name && !peer.disabled && loadedPeers[pubKey])
          )
            return;
          else if (!peer.disabled && peer.name && !loadedPeers[pubKey]) {
            loadedPeers[pubKey] = true;
            channel.peers[pubKey] = peer;
            loadMsgsOf(peerChannelChatPath, peer.name, this.emitter);
          }
        });
      });
  }

  async createAnnouncement(announcementName: string) {
    const gun = this.gun;
    const announcementPair = await (Gun.SEA as any).pair();
    const announcementKey = announcementPair.epub;
    const sec = await (Gun.SEA as any).secret(
      announcementKey,
      gun.user()._.sea,
    );
    const encPair = await Gun.SEA.encrypt(
      JSON.stringify(announcementPair),
      sec,
    );
    gun.user().get('announcement').get(announcementKey).put({
      pair: encPair,
      name: announcementName,
      key: announcementKey,
      owner: gun.user()._.sea.pub,
    });
    gun
      .user()
      .get('announcement')
      .get(announcementKey)
      .get('admins')
      .get(gun.user().is.pub)
      .put(this.publicName);
    gun
      .user()
      .get('announcement')
      .get(announcementKey)
      .get('peers')
      .get(gun.user().is.pub)
      .put(
        JSON.stringify({
          alias: gun.user().is.alias,
          name: this.publicName,
          joined: true,
          disabled: false,
          pubKey: gun.user().is.pub,
        }),
      );
  }

  leaveAnnouncement(announcement: Announcement) {
    const gun = this.gun;
    const leaveMsg = `${this.publicName} has left the chat.`;
    this.sendMessageToAnnouncement(announcement, leaveMsg, {
      pubKey: gun.user().is.pub,
      alias: gun.user().is.alias,
      name: this.publicName!,
      action: 'leave',
    });
    gun
      .user()
      .get('announcement')
      .get(announcement.key)
      .put({ disabled: true });
  }

  async loadAnnouncements() {
    const gun = this.gun;
    const loadedAnnouncements = {};
    const loadedAnnouncementsList = this.announcementsList;
    gun
      .user()
      .get('announcement')
      .not((key) => {
        this.emitter.emit('announcements', loadedAnnouncementsList);
      });
    gun
      .user()
      .get('announcement')
      .on(async (announcements) => {
        if (!announcements) return;
        Object.keys(announcements).forEach(async (announcementKey) => {
          if (announcementKey === '_' || loadedAnnouncements[announcementKey])
            return;
          (Gun.SEA as any).secret(announcementKey, gun.user()._.sea, (sec) => {
            gun
              .user()
              .get('announcement')
              .get(announcementKey)
              .on((announcement) => {
                if (
                  !announcement ||
                  !announcement.key ||
                  (announcement &&
                    announcement.key &&
                    !announcement.disabled &&
                    loadedAnnouncements[announcementKey])
                )
                  return;
                if (
                  announcement.disabled &&
                  loadedAnnouncements[announcementKey]
                ) {
                  const index = loadedAnnouncementsList
                    .map((c) => c.key)
                    .indexOf(announcementKey);
                  loadedAnnouncementsList.splice(index, 1);
                  loadedAnnouncements[announcementKey] = false;
                  this.emitter.emit('announcements', loadedAnnouncementsList);
                } else if (
                  !announcement.disabled &&
                  announcement.name &&
                  !loadedAnnouncements[announcementKey]
                ) {
                  const loadedPeers = {};
                  const loadedAdmins = {};
                  let loadedAnnouncementIndex;
                  gun
                    .user()
                    .get('announcement')
                    .get(announcementKey)
                    .get('peers')
                    .once(async (peers) => {
                      if (!peers || loadedAnnouncements[announcementKey])
                        return;
                      gun
                        .user()
                        .get('announcement')
                        .get(announcementKey)
                        .get('admins')
                        .on(async (admins) => {
                          if (!admins) return;
                          if (!loadedAnnouncements[announcementKey]) {
                            loadedAnnouncements[announcementKey] = true;
                            const pair = await Gun.SEA.decrypt(
                              announcement.pair,
                              sec,
                            );
                            loadedAnnouncementIndex =
                              loadedAnnouncementsList.length;
                            loadedAnnouncementsList.push({
                              key: announcementKey,
                              name: announcement.name,
                              owner: announcement.owner,
                              userCount: 0,
                              latestMsg: null,
                              peers: loadedPeers,
                              admins: loadedAdmins,
                              pair,
                            });
                            this.emitter.emit(
                              'announcements',
                              loadedAnnouncementsList,
                            );
                          }
                          if (typeof loadedAnnouncementIndex === 'undefined')
                            return;
                          Object.keys(peers).forEach((pubKey) => {
                            if (pubKey === '_' || loadedPeers[pubKey]) return;
                            gun
                              .user()
                              .get('announcement')
                              .get(announcementKey)
                              .get('peers')
                              .get(pubKey)
                              .once((peerData) => {
                                if (
                                  !peerData ||
                                  peerData.disabled ||
                                  loadedPeers[pubKey]
                                )
                                  return;
                                loadedPeers[pubKey] = peerData;
                                loadedAnnouncementsList[
                                  loadedAnnouncementIndex
                                ].peers = loadedPeers;
                                this.emitter.emit(
                                  'announcements',
                                  loadedAnnouncementsList,
                                );
                              });
                          });
                          Object.keys(admins).forEach((pubKey) => {
                            if (pubKey === '_' || loadedAdmins[pubKey]) return;
                            gun
                              .user()
                              .get('announcement')
                              .get(announcementKey)
                              .get('admins')
                              .get(pubKey)
                              .once((name) => {
                                if (name === 'disabled' || loadedAdmins[pubKey])
                                  return;
                                loadedAdmins[pubKey] = name;
                                loadedAnnouncementsList[
                                  loadedAnnouncementIndex
                                ].admins = loadedAdmins;
                                this.emitter.emit(
                                  'announcements',
                                  loadedAnnouncementsList,
                                );
                              });
                          });
                          gun
                            .get('announcement')
                            .get(announcementKey)
                            .get('peers')
                            .get(gun.user().is.pub)
                            .get('new')
                            .on((newMsgs) => {
                              if (!newMsgs) return;
                              let newCount = 0;
                              Object.keys(newMsgs).forEach((time) => {
                                if (
                                  time === '_' ||
                                  time === 'disabled' ||
                                  !newMsgs[time] ||
                                  newMsgs[time] === 'disabled'
                                ) {
                                  return;
                                }
                                newCount += 1;
                              });
                              if (
                                loadedAnnouncementsList[loadedAnnouncementIndex]
                              ) {
                                loadedAnnouncementsList[
                                  loadedAnnouncementIndex
                                ].notifCount = newCount;
                              }
                              this.emitter.emit(
                                'announcements',
                                loadedAnnouncementsList,
                              );
                            });
                        });
                    });
                }
              });
          });
        });
      });
  }

  async inviteToAnnouncement(
    announcement: Announcement,
    username: string,
    peerPubKey: string,
    publicName: string,
  ) {
    if (!this.gun.user().is) {
      return;
    }
    const gun = this.gun;
    await this.validatePubKeyFromUsername(username, peerPubKey);
    const otherPeer = await gun.user(peerPubKey);
    let otherPeerEpub = otherPeer.epub;
    if (otherPeer.epub[2] === ':') {
      otherPeerEpub = JSON.parse(otherPeer.epub)[':'];
    }
    const inviteSec = await (Gun.SEA as any).secret(
      otherPeerEpub,
      gun.user()._.sea,
    );
    const eInvitePair = await Gun.SEA.encrypt(
      JSON.stringify(announcement.pair),
      inviteSec,
    );
    const announcementInvite = { ...announcement, peerName: this.publicName };
    announcementInvite.pair = eInvitePair;
    gun
      .get(peerPubKey)
      .get('invites')
      .get('announcement')
      .get(gun.user()._.sea.pub)
      .get(announcement.key)
      .put(JSON.stringify(announcementInvite));
    this.sendMessageToAnnouncement(
      announcement,
      `${publicName} has been invited.`,
      {
        pubKey: peerPubKey,
        alias: username,
        name: publicName,
        action: 'invited',
      },
    );
    gun
      .user()
      .get('announcement')
      .get(announcement.key)
      .get('peers')
      .get(peerPubKey)
      .put(
        JSON.stringify({
          alias: username,
          name: publicName,
          joined: false,
          disabled: false,
          pubKey: peerPubKey,
        }),
      );
  }

  async loadAnnouncementInvites() {
    if (!this.gun.user().is) {
      return;
    }
    const gun = this.gun;
    const loadedInvites = {};
    const loadedInvitesList = this.announcementInvitesList;
    gun
      .get(gun.user()._.sea.pub)
      .get('invites')
      .get('announcement')
      .not((key) => {
        this.emitter.emit('announcementInvites', loadedInvitesList);
      });
    gun
      .get(gun.user()._.sea.pub)
      .get('invites')
      .get('announcement')
      .on(async (peerInvites) => {
        if (!peerInvites) return;
        Object.keys(peerInvites).forEach((peerPub) => {
          if (peerPub === '_') return;
          gun
            .get(gun.user()._.sea.pub)
            .get('invites')
            .get('announcement')
            .get(peerPub)
            .on(async (announcements) => {
              if (!announcements || announcements === 'disabled') return;
              Object.keys(announcements).forEach(async (announcementKey) => {
                const announcement =
                  typeof announcements[announcementKey] === 'string' &&
                  announcements[announcementKey] !== 'disabled'
                    ? JSON.parse(announcements[announcementKey])
                    : announcements[announcementKey];
                if (
                  announcementKey === '_' ||
                  !announcement ||
                  (announcement &&
                    announcement.key &&
                    loadedInvites[announcementKey])
                )
                  return;
                if (
                  announcement === 'disabled' &&
                  loadedInvites[announcementKey]
                ) {
                  const index = loadedInvitesList
                    .map((c) => c.key)
                    .indexOf(announcementKey);
                  loadedInvitesList.splice(index, 1);
                  loadedInvites[announcementKey] = false;
                } else if (
                  announcement.key &&
                  !loadedInvites[announcementKey]
                ) {
                  loadedInvites[announcementKey] = announcementKey;
                  const peerKeys = await gun.user(peerPub).then();
                  const peerEpub = peerKeys ? peerKeys.epub : null;
                  const sec = await (Gun.SEA as any).secret(
                    peerEpub,
                    gun.user()._.sea,
                  );
                  if (typeof announcement.pair === 'string') {
                    announcement.pair = JSON.parse(
                      announcement.pair.substr(3, announcement.pair.length),
                    );
                  }
                  announcement.pair = await Gun.SEA.decrypt(
                    announcement.pair,
                    sec,
                  );
                  announcement.peerPub = peerPub;
                  announcement.peerAlias = peerKeys.alias;
                  announcement.key = announcementKey;
                  loadedInvitesList.push(announcement);
                }
                this.emitter.emit('announcementInvites', loadedInvitesList);
              });
            });
        });
      });
  }

  async acceptAnnouncementInvite(
    invite: Announcement & {
      peerPub: string;
      peerAlias: string;
      peerName: string;
    },
  ) {
    const gun = this.gun;
    gun
      .user()
      .get('announcement')
      .get(invite.key)
      .get('peers')
      .get(gun.user().is.pub)
      .put(
        JSON.stringify({
          alias: gun.user().is.alias,
          name: this.publicName,
          joined: true,
          key: invite.key,
          peerPub: invite.peerPub,
        }),
      );
    gun
      .user()
      .get('announcement')
      .get(invite.key)
      .get('peers')
      .get(invite.peerPub)
      .put(
        JSON.stringify({
          alias: invite.peerAlias,
          name: invite.peerName,
          joined: true,
          key: invite.key,
          peerPub: invite.peerPub,
        }),
      );
    const sec = await (Gun.SEA as any).secret(invite.key, gun.user()._.sea);
    const encPair = await Gun.SEA.encrypt(invite.pair, sec);
    gun.user().get('announcement').get(invite.key).put({
      pair: encPair,
      name: invite.name,
      key: invite.key,
      disabled: false,
      owner: invite.owner,
    });
    const loadedPeers = {};
    Object.keys(invite.peers).forEach((pubKey) => {
      if (pubKey === '_') return;
      const peer = invite.peers[pubKey];
      if (loadedPeers[pubKey] || !peer || peer.disabled) return;
      loadedPeers[pubKey] = pubKey;
      gun
        .user()
        .get('announcement')
        .get(invite.key)
        .get('peers')
        .get(pubKey)
        .put(JSON.stringify(peer));
    });
    const loadedAdmins = {};
    Object.keys(invite.admins).forEach((pubKey) => {
      if (pubKey === '_') return;
      const admin = invite.admins[pubKey];
      if (loadedAdmins[pubKey] || !admin || admin === 'disabled') return;
      loadedAdmins[pubKey] = admin;
      gun
        .user()
        .get('announcement')
        .get(invite.key)
        .get('admins')
        .get(pubKey)
        .put(admin);
    });
    gun
      .get(gun.user()._.sea.pub)
      .get('invites')
      .get('announcement')
      .get(invite.peerPub)
      .get(invite.key)
      .put('disabled');
    const announcement = invite;
    if (!announcement.peers[gun.user().is.pub]) {
      announcement.peers[gun.user().is.pub] = { alias: gun.user().is.alias };
    }
    announcement.peers[gun.user().is.pub].joined = true;
    const joinMsg = `${this.publicName} has joined the chat!`;
    this.sendMessageToAnnouncement(announcement, joinMsg, {
      pubKey: gun.user().is.pub,
      alias: gun.user().is.alias,
      name: this.publicName!,
      action: 'join',
    });
    const inviteIndex = this.announcementInvitesList.findIndex(
      (c) => c.key === invite.key,
    );
    this.announcementInvitesList.splice(inviteIndex, 1);
  }

  async denyAnnouncementInvite(
    invite: Announcement & {
      peerPub: string;
      peerAlias: string;
      peerName: string;
    },
  ) {
    if (!invite) {
      return;
    }
    const gun = this.gun;
    gun
      .get(gun.user()._.sea.pub)
      .get('invites')
      .get('announcement')
      .get(invite.peerPub)
      .get(invite.key)
      .put('disabled');
  }

  async sendMessageToAnnouncement(
    announcement: Announcement,
    msg: string,
    peerInfo: {
      pubKey: string;
      alias?: string;
      name: string;
      action: string;
    },
  ) {
    if (!msg) {
      return;
    }
    const gun = this.gun;
    const isAdmin =
      announcement.admins[gun.user().is.pub] &&
      announcement.admins[gun.user().is.pub] !== 'disabled';
    if (!isAdmin && !peerInfo) return;
    const time = Date.now();
    const sec = await (Gun.SEA as any).secret(
      announcement.key,
      announcement.pair,
    );
    const encMsg = await Gun.SEA.encrypt(msg, sec);
    const announcementChatToSend = gun
      .user()
      .get('announcement')
      .get(announcement.key)
      .get('chat');
    announcementChatToSend.get(time).put(
      JSON.stringify({
        msg: encMsg,
        userPub: gun.user().is.pub,
        userName: this.publicName,
        time,
        peerInfo,
      }),
    );
    if (isAdmin) {
      gun.get('announcement').get(announcement.key).get('latest').put({
        msg: encMsg,
        user: gun.user().is.pub,
        time,
        peerInfo,
      });
      if (!announcement.peers) return;
      Object.keys(announcement.peers).forEach((pubKey) => {
        if (
          pubKey !== '_' &&
          announcement.peers[pubKey] &&
          pubKey !== gun.user().is.pub
        ) {
          gun
            .get('announcement')
            .get(announcement.key)
            .get('peers')
            .get(pubKey)
            .get('new')
            .get(time)
            .put(
              JSON.stringify({
                msg: encMsg,
                user: gun.user().is.pub,
                time,
              }),
            );
        }
      });
    }
  }

  async loadMessagesOfAnnouncement(announcement: Announcement) {
    const gun = this.gun;
    this.activeAnnouncement = announcement.key;
    this.activeContact = null;
    const thisChat = this;
    const announcementKey = announcement.key;
    const loadedMsgsList: Message[] = [];
    const loadedMsgs = {};
    const announcementSec = await (Gun.SEA as any).secret(
      announcement.key,
      announcement.pair,
    );
    async function loadMsgsOf(path, name, emitter) {
      path.not((key) => {
        emitter.emit('announcementMessages', loadedMsgsList);
      });
      path.on((peerMsgs) => {
        if (!peerMsgs) return;
        Object.keys(peerMsgs).forEach((time) => {
          if (loadedMsgs[time + name] || time === '_') return;
          path.get(time).on(async (msgDataString) => {
            if (
              thisChat.activeAnnouncement !== announcement.key ||
              loadedMsgs[time + name]
            )
              return;
            loadedMsgs[time + name] = true;
            let msgData = msgDataString;
            if (typeof msgDataString === 'string') {
              msgData = JSON.parse(msgDataString);
            }
            if (typeof msgData.msg === 'string') {
              msgData.msg = JSON.parse(
                msgData.msg.substr(3, msgData.msg.length),
              );
            }
            const decMsg = await Gun.SEA.decrypt(msgData.msg, announcementSec);
            if (!msgData || !msgData.msg || !decMsg || !msgData.userPub) return;
            if (msgData.peerInfo) {
              if (typeof msgData.peerInfo === 'string') {
                msgData.peerInfo = JSON.parse(msgData.peerInfo);
              }
              if (msgData.peerInfo.action === 'join') {
                announcement.peers[msgData.peerInfo.pubKey] = {
                  alias: msgData.peerInfo.alias,
                  pubKey: msgData.peerInfo.pubKey,
                  name: msgData.peerInfo.name,
                  joined: true,
                  disabled: false,
                };
                gun
                  .user()
                  .get('announcement')
                  .get(announcementKey)
                  .get('peers')
                  .get(msgData.peerInfo.pubKey)
                  .put(
                    JSON.stringify(announcement.peers[msgData.peerInfo.pubKey]),
                  );
              } else if (msgData.peerInfo.action === 'leave') {
                gun
                  .user()
                  .get('announcement')
                  .get(announcement.key)
                  .get('peers')
                  .get(msgData.peerInfo.pubKey)
                  .put('disabled');
              } else if (msgData.peerInfo.action === 'invited') {
                let peerObj = {
                  alias: msgData.peerInfo.alias,
                  pubKey: msgData.peerInfo.pubKey,
                  name: msgData.peerInfo.name,
                  disabled: false,
                };
                if (announcement.peers[msgData.peerInfo.pubKey]) {
                  (peerObj as any).joined =
                    announcement.peers[msgData.peerInfo.pubKey].joined;
                }
                gun
                  .user()
                  .get('announcement')
                  .get(announcementKey)
                  .get('peers')
                  .get(msgData.peerInfo.pubKey)
                  .put(JSON.stringify(peerObj));
              } else if (
                msgData.peerInfo.action === 'newAdmin' &&
                msgData.userPub === announcement.owner
              ) {
                gun
                  .user()
                  .get('announcement')
                  .get(announcementKey)
                  .get('admins')
                  .get(msgData.peerInfo.pubKey)
                  .put(msgData.peerInfo.name);
                announcement.admins[msgData.peerInfo.pubKey] =
                  msgData.peerInfo.name;
              }
            }
            if (
              msgData.peerInfo ||
              (announcement.admins[msgData.userPub] &&
                announcement.admins[msgData.userPub] !== 'disabled')
            ) {
              loadedMsgsList.push({
                time: msgData.time,
                userPub: msgData.userPub,
                owner: name,
                msg: decMsg,
                peerInfo: msgData.peerInfo,
              });
              loadedMsgsList.sort((a, b) => a.time - b.time);
              emitter.emit('announcementMessages', loadedMsgsList);
            }
            gun
              .get('announcement')
              .get(announcement.key)
              .get('peers')
              .get(gun.user().is.pub)
              .get('new')
              .get(msgData.time)
              .put('disabled');
          });
        });
      });
    }
    const loadedPeers = {};
    gun
      .user()
      .get('announcement')
      .get(announcement.key)
      .get('peers')
      .on((peers) => {
        Object.keys(peers).forEach((pubKey) => {
          if (
            pubKey === '_' ||
            !peers[pubKey] ||
            typeof peers[pubKey] !== 'string'
          )
            return;
          let peer;
          if (peers[pubKey] !== 'disabled') {
            peer = JSON.parse(peers[pubKey]);
            if (typeof peer === 'string') {
              peer = JSON.parse(peer);
            }
          } else if (peers[pubKey] === 'disabled' && loadedPeers[pubKey]) {
            delete announcement.peers[pubKey];
            loadedPeers[pubKey] = false;
            return;
          }
          const peerAnnouncementChatPath = gun
            .user(pubKey)
            .get('announcement')
            .get(announcementKey)
            .get('chat');
          if (
            !peer ||
            !peer.name ||
            (peer.name && !peer.disabled && loadedPeers[pubKey])
          )
            return;
          else if (!peer.disabled && peer.name && !loadedPeers[pubKey]) {
            loadedPeers[pubKey] = true;
            announcement.peers[pubKey] = peer;
            loadMsgsOf(peerAnnouncementChatPath, peer.name, this.emitter);
          }
        });
      });
  }
  async addAdminToAnnouncement(announcement: Announcement, newAdmin: Admin) {
    const gun = this.gun;
    gun
      .user()
      .get('announcement')
      .get(announcement.key)
      .get('owner')
      .once((ownerPub) => {
        if (gun.user().is.pub === ownerPub) {
          let newAdminMsg = `${newAdmin.name} has been made an admin.`;
          this.sendMessageToAnnouncement(announcement, newAdminMsg, {
            pubKey: newAdmin.pubKey,
            name: newAdmin.name,
            action: 'newAdmin',
          });
        }
      });
  }
}
