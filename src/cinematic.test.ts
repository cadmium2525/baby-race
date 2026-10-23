import test from 'node:test';
import assert from 'node:assert/strict';
import { CinematicDirector, CINEMATIC_TIMING } from './cinematic.ts';
import { createRace, startRace, updateRace, triggerEvent, type RaceEvent } from './simulation.ts';

const event = (id: number, eventId: RaceEvent['eventId'], babyId=0, time=12): RaceEvent => ({ id, eventId, babyId, time, text: 'event', kind: eventId?.startsWith('S') ? 'legendary' : 'rare' });

test('only actual rare events start closeups, not ordinary events, zones or supers', () => {
  const director = new CinematicDirector();
  director.observe([event(1,'N01'), event(2,undefined)], true);
  assert.equal(director.active,false);
  director.observe([event(3,'R01')], false);
  assert.equal(director.active,false);
  director.observe([event(4,'R02',2)], true);
  assert.equal(director.frame?.babyId,2);
  assert.equal(director.frame?.eventId,'R02');
  assert.equal(director.frame?.amount,0);
});

test('closeups enter, hold, exit and release with their own clock', () => {
  const director = new CinematicDirector();
  director.observe([event(1,'S01')],true);
  director.advance(CINEMATIC_TIMING.enter);
  assert.equal(director.frame?.phase,'hold');
  assert.equal(director.frame?.amount,1);
  director.advance(CINEMATIC_TIMING.legendary - CINEMATIC_TIMING.enter - CINEMATIC_TIMING.exit + .1);
  assert.equal(director.frame?.phase,'exit');
  assert.ok(director.frame!.amount>0 && director.frame!.amount<1);
  director.advance(1);
  assert.equal(director.frame?.amount,0);
  assert.equal(director.frame?.phase,'exit');
  director.advance(1/60);
  assert.equal(director.active,false);
});

test('a contagious occurrence shows its initiator once and never replays old notifications', () => {
  const director = new CinematicDirector();
  const contagious = [event(4,'R05',0), event(3,'R05',3), event(2,'R05',2), event(1,'R05',1)];
  director.observe(contagious,true);
  assert.equal(director.frame?.babyId,0);
  director.advance(3);
  director.advance(1/60);
  assert.equal(director.active,false);
  director.observe(contagious,true);
  assert.equal(director.active,false);
});

test('simultaneous different events prioritize legendary then finish the rare queue', () => {
  const director = new CinematicDirector();
  director.observe([event(2,'R01',1),event(1,'S02',2)],true);
  assert.equal(director.frame?.eventId,'S02');
  director.advance(CINEMATIC_TIMING.legendary);
  assert.equal(director.frame?.eventId,'S02');
  assert.equal(director.frame?.amount,0);
  director.advance(1/60);
  assert.equal(director.frame?.eventId,'R01');
  director.advance(3);
  director.advance(1/60);
  assert.equal(director.active,false);
});

test('an early skip smoothly exits from the existing camera amount', () => {
  const director = new CinematicDirector();
  director.observe([event(1,'R01')],true);
  director.advance(.17);
  const amount = director.frame!.amount;
  director.skip();
  assert.equal(director.frame?.phase,'exit');
  assert.ok(Math.abs(director.frame!.amount-amount)<1e-10);
  director.advance(.6);
  assert.equal(director.frame?.amount,0);
  director.advance(1/60);
  assert.equal(director.active,false);
});

test('presentation cannot consume the race timer, effect duration, positions or super availability', () => {
  const race = createRace('normal',3);
  startRace(race); updateRace(race,3);
  assert.equal(triggerEvent(race,'R04',1),true);
  const before = structuredClone(race);
  const director = new CinematicDirector();
  director.observe(race.events,true);
  director.advance(1.4);
  assert.deepEqual(race,before);
  director.advance(3);
  assert.deepEqual(race,before);
  updateRace(race,1/60);
  assert.ok(race.time>before.time);
  assert.ok(race.babies[1].stateTime<before.babies[1].stateTime);
});

test('replay clears an unfinished shot and accepts new notification ids', () => {
  const director = new CinematicDirector();
  director.observe([event(1,'R01')],true);
  director.advance(.2);
  director.reset();
  assert.equal(director.active,false);
  director.observe([event(1,'R01',3)],true);
  assert.equal(director.frame?.babyId,3);
  director.advance(NaN); director.advance(-1);
  assert.equal(director.frame?.elapsed,0);
});

test('extended stories have time for their full sequence and still skip smoothly', () => {
  for (const [id, duration] of [['R09',4.2],['R10',3.6],['S09',4.6],['S10',4],['S11',4.2],['S12',4.4],['S13',4.2],['S14',4.2],['S15',3.8],['S16',4.2],['S17',4.2],['S18',4]] as const) {
    const director = new CinematicDirector();
    director.observe([event(1,id)],true);
    assert.equal(director.frame?.duration,duration);
    director.advance(1.8);
    assert.equal(director.frame?.phase,'hold');
    director.skip();
    assert.equal(director.frame?.phase,'exit');
    director.advance(1);
    assert.equal(director.frame?.amount,0);
    director.advance(1/60);
    assert.equal(director.active,false);
  }
});

test('a crying relay features its origin once while keeping every affected racer frozen', () => {
  const race = createRace('normal',7);
  startRace(race); updateRace(race,3);
  race.babies.forEach((baby,id)=>{baby.x=id;});
  assert.equal(triggerEvent(race,'R10',2),true);
  assert.equal(race.babies.filter(baby=>baby.eventId==='R10').length,4);
  const before=structuredClone(race);
  const director=new CinematicDirector();
  director.observe(race.events,true);
  assert.equal(director.frame?.babyId,2);
  director.advance(3.6); director.advance(1/60);
  assert.equal(director.active,false);
  director.observe(race.events,true);
  assert.equal(director.active,false);
  assert.deepEqual(race,before);
});
