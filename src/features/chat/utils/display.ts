import type { AgentId, ChatMessage, ChatMessagePart } from './types';

const injectedPageContextPattern = /^[\s\S]*?Page context:[\s\S]*?\n\nFelipe says:\s*/i;

export function stripInjectedPageContext(text: string) {
  return text.replace(injectedPageContextPattern, '').trim();
}

type DisplayOptions = {
  hideSystem?: boolean;
};

export function displayableChatMessage(
  message: ChatMessage,
  options: DisplayOptions = {}
): ChatMessage | null {
  if (options.hideSystem && message.role === 'system') return null;

  const content =
    message.role === 'user' ? stripInjectedPageContext(message.content) : message.content;
  const parts = (message.parts ?? [])
    .map((part) => {
      if (part.type !== 'text') return part;
      const text = message.role === 'user' ? stripInjectedPageContext(part.text) : part.text;
      return text ? { ...part, text } : null;
    })
    .filter((part): part is ChatMessagePart => Boolean(part));

  if (!content.trim() && !parts.length) return null;
  return {
    ...message,
    content,
    parts: parts.length ? parts : content ? [{ type: 'text', text: content }] : []
  };
}

export function displayableMessages(messages: ChatMessage[], options: DisplayOptions = {}) {
  return messages
    .map((message) => displayableChatMessage(message, options))
    .filter((message): message is ChatMessage => message !== null);
}

export function displayableMessagesByAgent(
  messagesByAgent: Record<AgentId, ChatMessage[]>,
  options: DisplayOptions = {}
) {
  return Object.fromEntries(
    Object.entries(messagesByAgent).map(([agentId, messages]) => [
      agentId,
      displayableMessages(messages, options)
    ])
  ) as Record<AgentId, ChatMessage[]>;
}
