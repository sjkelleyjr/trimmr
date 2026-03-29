import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Field, Panel, PrimaryButton, RangeField } from '@looplab/ui'

describe('ui package', () => {
  it('renders panels and fields with and without optional copy', () => {
    const click = vi.fn()

    render(
      <>
        <Panel title="Panel title">body</Panel>
        <Panel title="Panel with description" description="Helpful copy">
          <Field label="Field label">
            <input type="text" />
          </Field>
          <RangeField
            label="Range label"
            value={50}
            min={0}
            max={100}
            step={5}
            onChange={() => {}}
            hint="50%"
          />
          <PrimaryButton onClick={click}>Press</PrimaryButton>
        </Panel>
      </>,
    )

    expect(screen.getByText('Panel title')).toBeInTheDocument()
    expect(screen.getByText('Panel with description')).toBeInTheDocument()
    expect(screen.getByText('Helpful copy')).toBeInTheDocument()
    expect(screen.getByLabelText('Field label')).toBeInTheDocument()
    expect(screen.getByRole('slider')).toHaveValue('50')
    screen.getByRole('button', { name: 'Press' }).click()
    expect(click).toHaveBeenCalled()
  })
})
