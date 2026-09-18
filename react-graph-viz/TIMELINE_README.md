# Network Timeline Feature

This feature allows you to view how your network has grown over time by adding timestamps to nodes and relationships.

## Features

### 1. **Timeline Mode**
- Click the "Timeline" button to enter timeline mode
- View the network as it existed at any point in time
- Scroll through time using the timeline slider

### 2. **Database Schema Changes**
- **Nodes**: Added `createdAt` property
- **Relationships**: Added `createdAt` property
- All timestamps are stored as Unix timestamps (milliseconds since epoch)

### 3. **Timeline Controls**
- **Slider**: Drag to move through time
- **Reset to Current**: Return to the current state of the network
- **Load Current**: Load the current network state
- **Stats Display**: Shows number of nodes and connections at the selected time

## How It Works

### Timeline Query
The timeline feature uses Cypher queries that filter nodes and relationships based on their creation timestamps:

```cypher
MATCH (u:User)-[r:CONNECTED_TO]->(v:User)
WHERE (u.createdAt IS NULL OR u.createdAt <= $timestamp)
AND (v.createdAt IS NULL OR v.createdAt <= $timestamp)
AND (r.createdAt IS NULL OR r.createdAt <= $timestamp)
RETURN u.name AS source, u.role AS sourceRole, u.location AS sourceLocation, u.website AS sourceWebsite,
       v.name AS target, v.role AS targetRole, v.location AS targetLocation, v.website AS targetWebsite
```

### Timeline Stats Query
The timeline range is calculated from both node and relationship creation times:

```cypher
MATCH (u:User)
WHERE u.createdAt IS NOT NULL
WITH collect(u.createdAt) as nodeTimes
OPTIONAL MATCH ()-[r:CONNECTED_TO]->()
WHERE r.createdAt IS NOT NULL
WITH nodeTimes + collect(r.createdAt) as allTimes
UNWIND allTimes as timestamp
RETURN min(timestamp) as earliest, max(timestamp) as latest
```

### Migration
- Existing data without timestamps will be automatically migrated when the app loads
- New nodes and relationships will automatically get timestamps
- The migration script adds current timestamp to all existing data

## Usage

1. **Enter Timeline Mode**: Click the "Timeline" button
2. **Navigate Time**: Use the slider to move through different time periods
3. **View Network Growth**: See how nodes and connections were added over time
4. **Exit Timeline**: Click "Exit Timeline" to return to current view

## Technical Details

### State Management
- `timelineMode`: Boolean to track if timeline mode is active
- `timelineDate`: Current selected date in timeline
- `timelineData`: Network data for the selected time
- `timelineStats`: Earliest and latest timestamps in the database

### Performance Considerations
- Timeline queries are optimized to only fetch data that existed at the selected time
- The slider uses actual timestamps for precise time navigation
- Timeline data is cached to avoid repeated database queries

## Future Enhancements

1. **Animation**: Add smooth transitions between time periods
2. **Events**: Show major network events (first connection, milestone nodes, etc.)
3. **Analytics**: Display growth statistics and trends
4. **Export**: Export timeline data for external analysis
5. **Filters**: Filter timeline by node types, locations, or other criteria

## Database Migration

The migration script (`migrateTimestamps.js`) will automatically run when the app loads and will:

1. Add `createdAt` to all existing nodes
2. Add `createdAt` to all existing relationships
3. Set all existing timestamps to the current time

**Note**: This is a one-time migration. After running, all new data will automatically include timestamps.
