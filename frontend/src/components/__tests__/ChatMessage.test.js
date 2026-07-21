import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ChatMessage from '../ChatMessage.vue'

describe('ChatMessage', () => {
  it('renders AI message with markdown', () => {
    const wrapper = mount(ChatMessage, {
      props: { role: 'ai', content: 'Hello **world**' }
    })
    expect(wrapper.find('.chat-message.ai').exists()).toBe(true)
    expect(wrapper.find('.markdown-body').exists()).toBe(true)
    expect(wrapper.html()).toContain('world')
  })

  it('renders user message with correct class', () => {
    const wrapper = mount(ChatMessage, {
      props: { role: 'user', content: 'my question' }
    })
    expect(wrapper.find('.chat-message.user').exists()).toBe(true)
  })

  it('renders tool message as status bubble', () => {
    const wrapper = mount(ChatMessage, {
      props: { role: 'tool', content: 'executing...' }
    })
    expect(wrapper.find('.status-bubble').exists()).toBe(true)
  })

  it('renders tool call progress', () => {
    const toolCalls = [
      { status: 'running', name: 'search_faq' },
      { status: 'done', name: 'list_customers', summary: 'Found 5' }
    ]
    const wrapper = mount(ChatMessage, {
      props: { role: 'ai', content: 'Working...', toolCalls }
    })
    const items = wrapper.findAll('.tool-item')
    expect(items).toHaveLength(2)
    expect(items[0].classes()).toContain('running')
    expect(items[1].classes()).toContain('done')
    expect(items[1].text()).toContain('Found 5')
  })

  it('formats tool names correctly', () => {
    const wrapper = mount(ChatMessage, {
      props: {
        role: 'ai',
        content: 'test',
        toolCalls: [{ status: 'done', name: 'search_local_files' }]
      }
    })
    expect(wrapper.find('.tool-name').text()).toBe('Search local files')
  })

  it('detects approval_required and renders approval card', () => {
    const wrapper = mount(ChatMessage, {
      props: {
        role: 'ai',
        content: 'approval_required: true\n工具: execute_command\n级别: critical\n说明: 执行系统命令\n审批ID: apr_test123'
      }
    })
    expect(wrapper.find('.approval-card').exists()).toBe(true)
    expect(wrapper.find('.approval-header').text()).toContain('危险操作需要审批')
  })

  it('auto-links download URLs', () => {
    const wrapper = mount(ChatMessage, {
      props: {
        role: 'ai',
        content: 'Download: /api/download/excel/report.xlsx'
      }
    })
    const html = wrapper.html()
    expect(html).toContain('/api/download/excel/report.xlsx')
  })

  it('handles empty content gracefully', () => {
    const wrapper = mount(ChatMessage, {
      props: { role: 'ai', content: '' }
    })
    expect(wrapper.find('.chat-message').exists()).toBe(true)
  })
})
