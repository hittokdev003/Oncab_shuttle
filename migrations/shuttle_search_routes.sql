-- Migration to support shuttle search routes and index location coordinates for stops.

ALTER TABLE `stops` ADD INDEX `stops_lat_lng_idx` (`latitude`, `longitude`);
ALTER TABLE `bus_stops` ADD INDEX `bus_stops_lat_lng_idx` (`latitude`, `longitude`);
