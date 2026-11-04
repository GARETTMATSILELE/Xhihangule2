"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const propertyAccess_1 = require("../utils/propertyAccess");
const agent = '683dc55672d212a2f8aebff0';
const otherA = '68583b3402abcc117d1c037d';
const otherB = '68a87e730a904b150ddec26b';
const existing = [otherA, agent, otherB];
const requested = [...existing, '6a9e974ca4536d5b9eb7d473'];
const accessible = [agent, '6a9e974ca4536d5b9eb7d473'];
const added = (0, propertyAccess_1.planOwnerPropertyAssignment)(existing, requested, accessible);
if (added.rejected.length !== 0)
    throw new Error('adding an accessible property was rejected');
if (!added.properties.includes('6a9e974ca4536d5b9eb7d473'))
    throw new Error('new property was not kept');
if (!added.properties.includes(otherA) || !added.properties.includes(otherB)) {
    throw new Error('another user\'s existing property link was dropped');
}
if (added.added.join(',') !== '6a9e974ca4536d5b9eb7d473')
    throw new Error('added set is wrong');
const removed = (0, propertyAccess_1.planOwnerPropertyAssignment)(existing, [otherA, otherB], accessible);
if (removed.properties.includes(agent))
    throw new Error('caller could not remove their own property');
if (!removed.properties.includes(otherA) || !removed.properties.includes(otherB)) {
    throw new Error('caller removed a property they cannot access');
}
if (removed.removed.join(',') !== agent)
    throw new Error('removed set is wrong');
const stolen = (0, propertyAccess_1.planOwnerPropertyAssignment)(existing, [...requested, 'not-mine'], accessible);
if (!stolen.rejected.includes('not-mine'))
    throw new Error('an inaccessible new property was accepted');
console.log('owner property assignment: 3/3 passed');
