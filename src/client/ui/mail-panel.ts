/**
 * MailPanel - Mail UI component for reading, composing, and managing messages.
 * Follows SearchMenuPanel pattern: draggable, glassmorphic, page navigation.
 */
import type {
  WsMessage,
  WsMessageType as WsMT,
  WsRespMailFolder,
  WsRespMailMessage,
  WsRespMailSent,
  WsRespMailDeleted,
  WsRespMailUnreadCount,
  WsRespMailDraftSaved,
  MailFolder,
  MailMessageHeader,
  MailMessageFull,
} from '../../shared/types';
import { WsMessageType } from '../../shared/types';

type MailPanelState = 'folder-list' | 'message-view' | 'compose';
type ComposeMode = 'new' | 'reply' | 'forward';

interface MailPanelCallbacks {
  getMailFolder: (folder: MailFolder) => void;
  readMailMessage: (folder: MailFolder, messageId: string) => void;
  composeMail: (to: string, subject: string, body: string[], headers?: string) => void;
  saveDraft: (to: string, subject: string, body: string[], headers?: string, existingDraftId?: string) => void;
  deleteMailMessage: (folder: MailFolder, messageId: string) => void;
}

export class MailPanel {
  private panel: HTMLElement;
  private headerTitle: HTMLElement;
  private contentElement: HTMLElement;
  private callbacks: MailPanelCallbacks;

  private state: MailPanelState = 'folder-list';
  private currentFolder: MailFolder = 'Inbox';
  private currentMessages: MailMessageHeader[] = [];
  private currentMessage: MailMessageFull | null = null;
  private unreadCount: number = 0;
  private composeMode: ComposeMode = 'new';
  private composeOriginalMessage: MailMessageFull | null = null;

  // Drag state
  private isDragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;

  constructor(callbacks: MailPanelCallbacks) {
    this.callbacks = callbacks;
    this.panel = this.createPanel();
    this.headerTitle = this.panel.querySelector('.mail-title')!;
    this.contentElement = this.panel.querySelector('.mail-content')!;
    document.body.appendChild(this.panel);
  }

  private createPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'mail-panel';
    panel.style.cssText = `
      position: fixed;
      width: 550px;
      max-height: 80vh;
      background: linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(51, 65, 85, 0.95));
      border: 1px solid var(--glass-border, rgba(148, 163, 184, 0.2));
      backdrop-filter: blur(20px);
      border-radius: 16px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      z-index: 1000;
      display: none;
      flex-direction: column;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    panel.innerHTML = `
      <div class="mail-header" style="
        padding: 12px 16px;
        background: linear-gradient(135deg, #1e3a5f, #2563eb);
        border-bottom: 1px solid rgba(148, 163, 184, 0.2);
        display: flex;
        justify-content: space-between;
        align-items: center;
        cursor: move;
        user-select: none;
      ">
        <div style="display: flex; align-items: center; gap: 8px;">
          <button class="mail-back-btn" style="
            display: none;
            background: rgba(255,255,255,0.1);
            border: none;
            color: white;
            font-size: 16px;
            cursor: pointer;
            padding: 4px 8px;
            border-radius: 4px;
          ">&larr;</button>
          <span class="mail-title" style="color: white; font-weight: 600; font-size: 14px;">Mail - Inbox</span>
        </div>
        <button class="mail-close-btn" style="
          background: rgba(255,255,255,0.1);
          border: none;
          color: white;
          font-size: 16px;
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 4px;
        ">&times;</button>
      </div>
      <div class="mail-tabs" style="
        display: flex;
        gap: 0;
        border-bottom: 1px solid rgba(148, 163, 184, 0.2);
        background: rgba(15, 23, 42, 0.5);
      "></div>
      <div class="mail-content" style="
        flex: 1;
        overflow-y: auto;
        max-height: calc(80vh - 120px);
        color: #e2e8f0;
        font-size: 13px;
      "></div>
    `;

    // Event handlers
    const header = panel.querySelector('.mail-header') as HTMLElement;
    header.addEventListener('mousedown', (e) => {
      const target = e.target as HTMLElement;
      if (!target.closest('button')) {
        this.startDrag(e);
      }
    });

    const closeBtn = panel.querySelector('.mail-close-btn')!;
    closeBtn.addEventListener('click', () => this.hide());

    const backBtn = panel.querySelector('.mail-back-btn')!;
    backBtn.addEventListener('click', () => this.goBack());

    // Render folder tabs
    this.renderTabs(panel.querySelector('.mail-tabs')!);

    return panel;
  }

  private renderTabs(container: HTMLElement): void {
    const folders: MailFolder[] = ['Inbox', 'Sent', 'Draft'];
    container.innerHTML = '';

    for (const folder of folders) {
      const tab = document.createElement('button');
      const isActive = folder === this.currentFolder;
      const badge = folder === 'Inbox' && this.unreadCount > 0
        ? ` <span style="
            background: #ef4444;
            color: white;
            font-size: 10px;
            padding: 1px 5px;
            border-radius: 8px;
            margin-left: 4px;
          ">${this.unreadCount}</span>`
        : '';

      tab.innerHTML = `${folder}${badge}`;
      tab.style.cssText = `
        flex: 1;
        padding: 10px 16px;
        background: ${isActive ? 'rgba(37, 99, 235, 0.3)' : 'transparent'};
        border: none;
        border-bottom: 2px solid ${isActive ? '#3b82f6' : 'transparent'};
        color: ${isActive ? '#93c5fd' : '#94a3b8'};
        font-size: 13px;
        font-weight: ${isActive ? '600' : '400'};
        cursor: pointer;
        transition: all 0.15s;
      `;

      tab.addEventListener('mouseenter', () => {
        if (!isActive) tab.style.background = 'rgba(37, 99, 235, 0.15)';
      });
      tab.addEventListener('mouseleave', () => {
        if (!isActive) tab.style.background = 'transparent';
      });

      tab.addEventListener('click', () => {
        this.currentFolder = folder;
        this.state = 'folder-list';
        this.renderTabs(this.panel.querySelector('.mail-tabs')!);
        this.updateTitle();
        this.updateBackButton();
        this.callbacks.getMailFolder(folder);
        this.renderLoading();
      });

      container.appendChild(tab);
    }

    // Compose button
    const composeBtn = document.createElement('button');
    composeBtn.textContent = '+ New';
    composeBtn.style.cssText = `
      padding: 10px 16px;
      background: transparent;
      border: none;
      color: #3b82f6;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
    `;
    composeBtn.addEventListener('mouseenter', () => {
      composeBtn.style.background = 'rgba(37, 99, 235, 0.15)';
    });
    composeBtn.addEventListener('mouseleave', () => {
      composeBtn.style.background = 'transparent';
    });
    composeBtn.addEventListener('click', () => {
      this.showCompose();
    });
    container.appendChild(composeBtn);
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  public show(): void {
    this.panel.style.display = 'flex';

    // Center if not already positioned
    if (!this.panel.dataset.positioned) {
      const rect = this.panel.getBoundingClientRect();
      this.panel.style.left = `${(window.innerWidth - rect.width) / 2}px`;
      this.panel.style.top = `${(window.innerHeight - rect.height) / 2}px`;
      this.panel.dataset.positioned = '1';
    }

    // Load current folder
    this.state = 'folder-list';
    this.updateTitle();
    this.updateBackButton();
    this.callbacks.getMailFolder(this.currentFolder);
    this.renderLoading();
  }

  public hide(): void {
    this.panel.style.display = 'none';
  }

  public isVisible(): boolean {
    return this.panel.style.display !== 'none';
  }

  public setUnreadCount(count: number): void {
    this.unreadCount = count;
    this.renderTabs(this.panel.querySelector('.mail-tabs')!);
  }

  public handleResponse(msg: WsMessage): void {
    switch (msg.type) {
      case WsMessageType.RESP_MAIL_FOLDER: {
        const resp = msg as WsRespMailFolder;
        this.currentMessages = resp.messages;
        this.renderFolderList();
        break;
      }
      case WsMessageType.RESP_MAIL_MESSAGE: {
        const resp = msg as WsRespMailMessage;
        this.currentMessage = resp.message;
        this.state = 'message-view';
        this.updateTitle();
        this.updateBackButton();
        this.renderMessageView();
        break;
      }
      case WsMessageType.RESP_MAIL_SENT: {
        const resp = msg as WsRespMailSent;
        if (resp.success) {
          this.state = 'folder-list';
          this.updateTitle();
          this.updateBackButton();
          this.callbacks.getMailFolder(this.currentFolder);
          this.renderLoading();
        } else {
          this.renderError(resp.message || 'Failed to send message');
        }
        break;
      }
      case WsMessageType.RESP_MAIL_DELETED: {
        // Refresh folder after delete
        this.callbacks.getMailFolder(this.currentFolder);
        this.state = 'folder-list';
        this.updateTitle();
        this.updateBackButton();
        this.renderLoading();
        break;
      }
      case WsMessageType.RESP_MAIL_DRAFT_SAVED: {
        const resp = msg as WsRespMailDraftSaved;
        if (resp.success) {
          // Navigate to Draft folder after saving
          this.currentFolder = 'Draft';
          this.state = 'folder-list';
          this.updateTitle();
          this.updateBackButton();
          this.renderTabs(this.panel.querySelector('.mail-tabs')!);
          this.callbacks.getMailFolder('Draft');
          this.renderLoading();
        } else {
          this.renderError(resp.message || 'Failed to save draft');
        }
        break;
      }
      case WsMessageType.RESP_MAIL_UNREAD_COUNT: {
        const resp = msg as WsRespMailUnreadCount;
        this.setUnreadCount(resp.count);
        break;
      }
    }
  }

  // ==========================================================================
  // RENDERING
  // ==========================================================================

  private renderLoading(): void {
    this.contentElement.innerHTML = `
      <div style="padding: 32px; text-align: center; color: #94a3b8;">
        Loading...
      </div>
    `;
  }

  private renderError(message: string): void {
    this.contentElement.innerHTML = `
      <div style="padding: 24px; text-align: center; color: #f87171;">
        ${this.escapeHtml(message)}
      </div>
    `;
  }

  private renderFolderList(): void {
    if (this.currentMessages.length === 0) {
      this.contentElement.innerHTML = `
        <div style="padding: 32px; text-align: center; color: #64748b;">
          No messages in ${this.currentFolder}
        </div>
      `;
      return;
    }

    let html = '';
    for (const msg of this.currentMessages) {
      const unreadDot = !msg.read
        ? '<span style="width: 8px; height: 8px; border-radius: 50%; background: #3b82f6; flex-shrink: 0;"></span>'
        : '<span style="width: 8px; flex-shrink: 0;"></span>';
      const fontWeight = msg.read ? '400' : '600';
      const textColor = msg.read ? '#94a3b8' : '#e2e8f0';

      html += `
        <div class="mail-row" data-msg-id="${this.escapeHtml(msg.messageId)}" style="
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 16px;
          border-bottom: 1px solid rgba(148, 163, 184, 0.1);
          cursor: pointer;
          transition: background 0.15s;
        "
        onmouseenter="this.style.background='rgba(37, 99, 235, 0.1)'"
        onmouseleave="this.style.background='transparent'"
        >
          ${unreadDot}
          <div style="flex: 1; min-width: 0;">
            <div style="display: flex; justify-content: space-between; gap: 8px;">
              <span style="font-weight: ${fontWeight}; color: ${textColor}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                ${this.escapeHtml(this.currentFolder === 'Sent' ? msg.to : msg.from)}
              </span>
              <span style="color: #64748b; font-size: 11px; flex-shrink: 0;">
                ${this.escapeHtml(msg.dateFmt)}
              </span>
            </div>
            <div style="color: #94a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 2px;">
              ${this.escapeHtml(msg.subject)}
            </div>
          </div>
        </div>
      `;
    }

    this.contentElement.innerHTML = html;

    // Wire click handlers
    this.contentElement.querySelectorAll('.mail-row').forEach(row => {
      row.addEventListener('click', () => {
        const msgId = (row as HTMLElement).dataset.msgId!;
        this.callbacks.readMailMessage(this.currentFolder, msgId);
        this.renderLoading();
      });
    });
  }

  private renderMessageView(): void {
    if (!this.currentMessage) return;

    const msg = this.currentMessage;
    const isNoReply = msg.noReply;
    const attachHtml = msg.attachments.length > 0
      ? `<div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid rgba(148, 163, 184, 0.2);">
           <div style="color: #94a3b8; font-size: 11px; margin-bottom: 6px;">Attachments (${msg.attachments.length})</div>
           ${msg.attachments.map(a => `
             <div style="background: rgba(15, 23, 42, 0.5); padding: 8px 12px; border-radius: 6px; margin-bottom: 4px; font-size: 12px;">
               <span style="color: #93c5fd;">${this.escapeHtml(a.class)}</span>
               ${Object.entries(a.properties).map(([k, v]) => `<span style="color: #64748b; margin-left: 8px;">${this.escapeHtml(k)}: ${this.escapeHtml(v)}</span>`).join('')}
             </div>
           `).join('')}
         </div>`
      : '';

    this.contentElement.innerHTML = `
      <div style="padding: 16px;">
        <div style="margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="font-weight: 600; color: #e2e8f0;">${this.escapeHtml(msg.from)}</span>
            <span style="color: #64748b; font-size: 12px;">${this.escapeHtml(msg.dateFmt)}</span>
          </div>
          <div style="color: #94a3b8; font-size: 12px;">To: ${this.escapeHtml(msg.to)}</div>
          <div style="color: #e2e8f0; font-size: 15px; font-weight: 600; margin-top: 8px;">
            ${this.escapeHtml(msg.subject)}
          </div>
        </div>
        <div style="
          background: rgba(15, 23, 42, 0.4);
          padding: 12px 16px;
          border-radius: 8px;
          line-height: 1.6;
          white-space: pre-wrap;
          min-height: 100px;
        ">${this.escapeHtml(msg.body.join('\n'))}</div>
        ${attachHtml}
        <div style="display: flex; gap: 8px; margin-top: 16px;">
          ${!isNoReply ? `<button class="mail-reply-btn" style="
            padding: 8px 16px;
            background: #2563eb;
            border: none;
            color: white;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
          ">Reply</button>` : ''}
          <button class="mail-forward-btn" style="
            padding: 8px 16px;
            background: rgba(37, 99, 235, 0.2);
            border: 1px solid rgba(37, 99, 235, 0.4);
            color: #93c5fd;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
          ">Forward</button>
          <button class="mail-delete-btn" style="
            padding: 8px 16px;
            background: rgba(239, 68, 68, 0.2);
            border: 1px solid rgba(239, 68, 68, 0.4);
            color: #f87171;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
          ">Delete</button>
        </div>
      </div>
    `;

    // Wire reply
    const replyBtn = this.contentElement.querySelector('.mail-reply-btn');
    if (replyBtn) {
      replyBtn.addEventListener('click', () => {
        this.showCompose('reply', msg);
      });
    }

    // Wire forward
    const forwardBtn = this.contentElement.querySelector('.mail-forward-btn');
    if (forwardBtn) {
      forwardBtn.addEventListener('click', () => {
        this.showCompose('forward', msg);
      });
    }

    // Wire delete
    const deleteBtn = this.contentElement.querySelector('.mail-delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        if (confirm('Delete this message?')) {
          this.callbacks.deleteMailMessage(this.currentFolder, msg.messageId);
        }
      });
    }
  }

  private showCompose(mode: ComposeMode = 'new', originalMessage?: MailMessageFull): void {
    this.state = 'compose';
    this.composeMode = mode;
    this.composeOriginalMessage = originalMessage || null;
    this.updateTitle();
    this.updateBackButton();

    // Build pre-filled fields based on compose mode
    let toValue = '';
    let subjectValue = '';
    let bodyValue = '';

    if (originalMessage) {
      if (mode === 'reply') {
        toValue = originalMessage.fromAddr;
        subjectValue = originalMessage.subject.startsWith('RE: ')
          ? originalMessage.subject
          : `RE: ${originalMessage.subject}`;
        const quotedLines = originalMessage.body.map(line => `> ${line}`);
        bodyValue = `\n\n--- Original Message ---\n${quotedLines.join('\n')}`;
      } else if (mode === 'forward') {
        toValue = '';
        subjectValue = originalMessage.subject.startsWith('FW: ')
          ? originalMessage.subject
          : `FW: ${originalMessage.subject}`;
        const quotedLines = originalMessage.body.map(line => `> ${line}`);
        bodyValue = `\n\n--- Forwarded Message ---\nFrom: ${originalMessage.from}\nSubject: ${originalMessage.subject}\n\n${quotedLines.join('\n')}`;
      }
    }

    this.contentElement.innerHTML = `
      <div style="padding: 16px; display: flex; flex-direction: column; gap: 12px;">
        <div>
          <label style="display: block; color: #94a3b8; font-size: 11px; margin-bottom: 4px;">To</label>
          <input class="mail-compose-to" type="text" value="${this.escapeHtml(toValue)}" style="
            width: 100%;
            padding: 8px 12px;
            background: rgba(15, 23, 42, 0.6);
            border: 1px solid rgba(148, 163, 184, 0.2);
            border-radius: 6px;
            color: #e2e8f0;
            font-size: 13px;
            outline: none;
            box-sizing: border-box;
          " placeholder="recipient@world.net">
        </div>
        <div>
          <label style="display: block; color: #94a3b8; font-size: 11px; margin-bottom: 4px;">Subject</label>
          <input class="mail-compose-subject" type="text" value="${this.escapeHtml(subjectValue)}" style="
            width: 100%;
            padding: 8px 12px;
            background: rgba(15, 23, 42, 0.6);
            border: 1px solid rgba(148, 163, 184, 0.2);
            border-radius: 6px;
            color: #e2e8f0;
            font-size: 13px;
            outline: none;
            box-sizing: border-box;
          " placeholder="Subject">
        </div>
        <div>
          <label style="display: block; color: #94a3b8; font-size: 11px; margin-bottom: 4px;">Message</label>
          <textarea class="mail-compose-body" rows="8" style="
            width: 100%;
            padding: 8px 12px;
            background: rgba(15, 23, 42, 0.6);
            border: 1px solid rgba(148, 163, 184, 0.2);
            border-radius: 6px;
            color: #e2e8f0;
            font-size: 13px;
            outline: none;
            resize: vertical;
            font-family: inherit;
            box-sizing: border-box;
          " placeholder="Write your message...">${this.escapeHtml(bodyValue)}</textarea>
        </div>
        <div style="display: flex; gap: 8px; justify-content: flex-end;">
          <button class="mail-compose-cancel" style="
            padding: 8px 16px;
            background: rgba(148, 163, 184, 0.2);
            border: none;
            color: #94a3b8;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
          ">Cancel</button>
          <button class="mail-compose-save-draft" style="
            padding: 8px 16px;
            background: rgba(148, 163, 184, 0.2);
            border: 1px solid rgba(148, 163, 184, 0.3);
            color: #e2e8f0;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
          ">Save Draft</button>
          <button class="mail-compose-send" style="
            padding: 8px 24px;
            background: #2563eb;
            border: none;
            color: white;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 600;
          ">Send</button>
        </div>
      </div>
    `;

    // Wire cancel
    this.contentElement.querySelector('.mail-compose-cancel')!.addEventListener('click', () => {
      this.goBack();
    });

    // Wire save draft
    this.contentElement.querySelector('.mail-compose-save-draft')!.addEventListener('click', () => {
      const to = (this.contentElement.querySelector('.mail-compose-to') as HTMLInputElement).value.trim();
      const subject = (this.contentElement.querySelector('.mail-compose-subject') as HTMLInputElement).value.trim();
      const body = (this.contentElement.querySelector('.mail-compose-body') as HTMLTextAreaElement).value;
      const bodyLines = body.split('\n');
      this.callbacks.saveDraft(to, subject, bodyLines);
      this.renderLoading();
    });

    // Wire send
    this.contentElement.querySelector('.mail-compose-send')!.addEventListener('click', () => {
      const to = (this.contentElement.querySelector('.mail-compose-to') as HTMLInputElement).value.trim();
      const subject = (this.contentElement.querySelector('.mail-compose-subject') as HTMLInputElement).value.trim();
      const body = (this.contentElement.querySelector('.mail-compose-body') as HTMLTextAreaElement).value;

      if (!to) {
        alert('Please enter a recipient address.');
        return;
      }
      if (!subject) {
        alert('Please enter a subject.');
        return;
      }

      const bodyLines = body.split('\n');
      this.callbacks.composeMail(to, subject, bodyLines);
      this.renderLoading();
    });

    // Focus the appropriate field
    const toInput = this.contentElement.querySelector('.mail-compose-to') as HTMLInputElement;
    if (mode === 'reply') {
      // Reply: to is filled, focus body to type reply
      (this.contentElement.querySelector('.mail-compose-body') as HTMLTextAreaElement).focus();
    } else if (mode === 'forward') {
      // Forward: to is empty, focus To field
      toInput.focus();
    } else if (toInput.value) {
      (this.contentElement.querySelector('.mail-compose-body') as HTMLTextAreaElement).focus();
    } else {
      toInput.focus();
    }
  }

  // ==========================================================================
  // NAVIGATION
  // ==========================================================================

  private goBack(): void {
    this.state = 'folder-list';
    this.currentMessage = null;
    this.updateTitle();
    this.updateBackButton();
    this.renderFolderList();
  }

  private updateTitle(): void {
    switch (this.state) {
      case 'folder-list':
        this.headerTitle.textContent = `Mail - ${this.currentFolder}`;
        break;
      case 'message-view':
        this.headerTitle.textContent = this.currentMessage?.subject || 'Message';
        break;
      case 'compose':
        if (this.composeMode === 'reply') {
          this.headerTitle.textContent = 'Reply';
        } else if (this.composeMode === 'forward') {
          this.headerTitle.textContent = 'Forward';
        } else {
          this.headerTitle.textContent = 'New Message';
        }
        break;
    }
  }

  private updateBackButton(): void {
    const btn = this.panel.querySelector('.mail-back-btn') as HTMLElement;
    btn.style.display = this.state !== 'folder-list' ? 'block' : 'none';
  }

  // ==========================================================================
  // DRAG
  // ==========================================================================

  private startDrag(e: MouseEvent): void {
    this.isDragging = true;
    const rect = this.panel.getBoundingClientRect();
    this.dragOffsetX = e.clientX - rect.left;
    this.dragOffsetY = e.clientY - rect.top;

    const onMouseMove = (ev: MouseEvent) => {
      if (!this.isDragging) return;
      this.panel.style.left = `${ev.clientX - this.dragOffsetX}px`;
      this.panel.style.top = `${ev.clientY - this.dragOffsetY}px`;
    };

    const onMouseUp = () => {
      this.isDragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  // ==========================================================================
  // UTILITIES
  // ==========================================================================

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
