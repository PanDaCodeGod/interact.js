import PromisePolyfill from 'promise-polyfill'

import test from '@interactjs/_dev/test/test'
import type { InteractEvent } from '@interactjs/core/InteractEvent'
import type { ActionName } from '@interactjs/core/scope'
import * as helpers from '@interactjs/core/tests/_helpers'
import type { Point } from '@interactjs/types/index'

import reflow from './plugin'

const testAction = { name: 'TEST' as ActionName }

test('reflow', t => {
  const rect = Object.freeze({ top: 100, left: 200, bottom: 300, right: 400 })

  const {
    scope,
    interactable,
  } = helpers.testEnv({ plugins: [reflow], rect })

  Object.assign(scope.actions, { TEST: {}, names: ['TEST'] })

  t.ok(
    scope.Interactable.prototype.reflow instanceof Function,
    'reflow method is added to Interactable.prototype',
  )

  const fired: InteractEvent[] = []
  let beforeReflowDelta: Point

  interactable.fire = ((iEvent: any) => { fired.push(iEvent) }) as any
  (interactable.target as any) = {}
  ;(interactable.options as any).TEST = { enabled: true }
  interactable.rectChecker(() => ({ ...rect }))

  // modify move coords
  scope.addListeners({
    'interactions:before-action-move': ({ interaction }) => {
      interaction.coords.cur.page = {
        x: rect.left + 100,
        y: rect.top - 50,
      }
    },
    'interactions:before-action-reflow': ({ interaction }) => {
      beforeReflowDelta = { ...interaction.coords.delta.page }
    },
  })

  interactable.reflow(testAction)

  const phases = ['reflow', 'start', 'move', 'end']

  for (const index in phases) {
    const phase = phases[index]
    t.equal(fired[index].type, `TEST${phase}`, `event #${index} is ${phase}`)
  }

  const interaction = fired[0]._interaction

  t.deepEqual(
    interaction.coords.start.page,
    {
      x: rect.left,
      y: rect.top,
    },
    'uses element top left for event coords',
  )

  const reflowMove = fired[2]

  t.deepEqual(
    beforeReflowDelta,
    { x: 0, y: 0 },
    'interaction delta is zero before-action-reflow',
  )

  t.deepEqual(
    reflowMove.delta,
    { x: 100, y: -50 },
    'move delta is correct with modified interaction coords',
  )

  t.notOk(
    interaction.pointerIsDown,
    'reflow pointer was lifted',
  )

  t.equal(
    interaction.pointers.length,
    0,
    'reflow pointer was removed from interaction',
  )

  t.notOk(
    scope.interactions.list.includes(interaction),
    'interaction is removed from list',
  )

  t.end()
})

test('async reflow', async t => {
  const { scope } = helpers.testEnv({ plugins: [reflow] })

  Object.assign(scope.actions, { TEST: {}, names: ['TEST'] })

  let reflowEvent: any
  let promise

  const interactable = scope.interactables.new(scope.window)
  const rect = Object.freeze({ top: 100, left: 200, bottom: 300, right: 400 })
  interactable.rectChecker(() => ({ ...rect }))
  interactable.fire = ((iEvent: any) => { reflowEvent = iEvent }) as any
  (interactable.options as any).TEST = { enabled: true }

  // test with Promise implementation
  ;(scope.window as any).Promise = PromisePolyfill

  promise = interactable.reflow(testAction)
  t.ok(promise instanceof (scope.window as any).Promise, 'method returns a Promise if available')
  t.notOk(reflowEvent.interaction.interacting(), 'reflow may end synchronously')

  t.equal(await promise, interactable, 'returned Promise resolves to interactable')

  let stoppedFromTimeout: boolean
  // block the end of the reflow interaction and stop it after a timeout
  scope.addListeners({
    'interactions:before-action-end': ({ interaction }) => {
      setTimeout(() => { interaction.stop(); stoppedFromTimeout = true }, 0)
      return false
    },
  })

  stoppedFromTimeout = false
  promise = interactable.reflow(testAction)

  t.ok(reflowEvent.interaction.interacting() && !stoppedFromTimeout, 'interaction continues if end is blocked')
  await promise
  t.notOk(reflowEvent.interaction.interacting() && stoppedFromTimeout, 'interaction is stopped after promise is resolved')

  // test without Promise implementation
  stoppedFromTimeout = false
  ;(scope.window as any).Promise = undefined

  promise = interactable.reflow(testAction)
  t.equal(promise, null, 'method returns null if no Proise is avilable')
  t.ok(reflowEvent.interaction.interacting() && !stoppedFromTimeout, 'interaction continues if end is blocked without Promise')

  setTimeout(() => {
    t.notOk(reflowEvent.interaction.interacting() || !stoppedFromTimeout, 'interaction is stopped after timeout without Promised')
  }, 0)

  t.end()
})
