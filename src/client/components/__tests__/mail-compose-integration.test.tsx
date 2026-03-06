/**
 * Integration test: Mail compose flow.
 *
 * Tests the full user journey:
 * 1. MailPanel renders with folder tabs and compose button
 * 2. Clicking compose switches to compose view with empty fields
 * 3. User types recipient, subject, body
 * 4. Send button calls client.onMailSend with correct values
 * 5. Store resets compose state after send
 * 6. Reply flow pre-fills recipient and subject
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { screen, fireEvent } from '@testing-library/react';
import {
  renderWithProviders,
  resetStores,
  createSpiedCallbacks,
} from '../../__tests__/setup/render-helpers';
import { useMailStore } from '../../store/mail-store';
import { MailPanel } from '../mail/MailPanel';
import type { MailMessageFull } from '@/shared/types';

describe('Mail compose — integration flow', () => {
  beforeEach(() => {
    resetStores();
    // Reset mail store to default (Inbox, list view, not loading)
    useMailStore.setState({
      currentFolder: 'Inbox',
      currentView: 'list',
      messages: [],
      currentMessage: null,
      isLoading: false,
      composeTo: '',
      composeSubject: '',
      composeBody: '',
      composeHeaders: '',
    });
  });

  it('renders folder tabs and compose button in list view', () => {
    renderWithProviders(<MailPanel />);

    expect(screen.getByText('Inbox')).toBeTruthy();
    expect(screen.getByText('Sent')).toBeTruthy();
    expect(screen.getByText('Drafts')).toBeTruthy();
    expect(screen.getByText('Compose')).toBeTruthy();
  });

  it('switches to compose view when compose button clicked', () => {
    renderWithProviders(<MailPanel />);

    fireEvent.click(screen.getByText('Compose'));

    // Store should be in compose view
    expect(useMailStore.getState().currentView).toBe('compose');

    // Compose fields should be visible
    expect(screen.getByPlaceholderText('To')).toBeTruthy();
    expect(screen.getByPlaceholderText('Subject')).toBeTruthy();
    expect(screen.getByPlaceholderText('Message...')).toBeTruthy();
  });

  it('fills compose fields and sends mail', () => {
    const sendSpy = jest.fn();
    const mockCallbacks = createSpiedCallbacks({ onMailSend: sendSpy });

    renderWithProviders(<MailPanel />, { clientCallbacks: mockCallbacks });

    // Open compose
    fireEvent.click(screen.getByText('Compose'));

    // Fill fields
    fireEvent.change(screen.getByPlaceholderText('To'), {
      target: { value: 'player42' },
    });
    fireEvent.change(screen.getByPlaceholderText('Subject'), {
      target: { value: 'Trade Offer' },
    });
    fireEvent.change(screen.getByPlaceholderText('Message...'), {
      target: { value: 'I have wheat for sale.' },
    });

    // Click send
    fireEvent.click(screen.getByText('Send'));

    // Verify client callback was invoked with the right args
    expect(sendSpy).toHaveBeenCalledWith('player42', 'Trade Offer', 'I have wheat for sale.');

    // Store should reset compose state
    expect(useMailStore.getState().currentView).toBe('list');
    expect(useMailStore.getState().composeTo).toBe('');
    expect(useMailStore.getState().composeSubject).toBe('');
    expect(useMailStore.getState().composeBody).toBe('');
  });

  it('cancel button returns to list view without sending', () => {
    const sendSpy = jest.fn();
    const mockCallbacks = createSpiedCallbacks({ onMailSend: sendSpy });

    renderWithProviders(<MailPanel />, { clientCallbacks: mockCallbacks });

    // Open compose, fill something
    fireEvent.click(screen.getByText('Compose'));
    fireEvent.change(screen.getByPlaceholderText('Subject'), {
      target: { value: 'Draft subject' },
    });

    // Cancel
    fireEvent.click(screen.getByText('Cancel'));

    // Should NOT have sent
    expect(sendSpy).not.toHaveBeenCalled();

    // Should return to list view
    expect(useMailStore.getState().currentView).toBe('list');
  });

  it('reply pre-fills recipient and subject', () => {
    const replyMessage: MailMessageFull = {
      messageId: 'msg-99',
      from: 'Alice',
      fromAddr: 'alice',
      to: 'Me',
      toAddr: 'me',
      subject: 'Hello there',
      date: '2025-01-15',
      dateFmt: 'Jan 15',
      body: ['Hi, how are you?'],
      read: true,
      stamp: 42,
      noReply: false,
      attachments: [],
    };

    // Simulate having read a message, then clicking reply
    useMailStore.getState().startReply(replyMessage);

    renderWithProviders(<MailPanel />);

    // Compose view should be active with pre-filled fields
    const toField = screen.getByPlaceholderText('To') as HTMLInputElement;
    const subjectField = screen.getByPlaceholderText('Subject') as HTMLInputElement;

    expect(toField.value).toBe('alice');
    expect(subjectField.value).toBe('Re: Hello there');
  });

  it('switching folders triggers client.onMailGetFolder', () => {
    const getFolderSpy = jest.fn();
    const mockCallbacks = createSpiedCallbacks({ onMailGetFolder: getFolderSpy });

    renderWithProviders(<MailPanel />, { clientCallbacks: mockCallbacks });

    // Initial mount calls onMailGetFolder('Inbox')
    expect(getFolderSpy).toHaveBeenCalledWith('Inbox');

    // Click Sent tab
    fireEvent.click(screen.getByText('Sent'));

    expect(useMailStore.getState().currentFolder).toBe('Sent');
    expect(getFolderSpy).toHaveBeenCalledWith('Sent');
  });
});
