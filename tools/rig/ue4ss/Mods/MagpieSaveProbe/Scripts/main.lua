assert(os.getenv("MAGPIE_VALIDATION_WORLD") == "isolated-copy", "validation requires an isolated copy of the world")
local OUT = assert(os.getenv("MAGPIE_PROBE_FILE"))

local function write(line)
    local file = assert(io.open(OUT, "a"))
    file:write(line, "\n")
    file:close()
end

local function dump(value)
    if type(value) ~= "table" then return tostring(value) end
    local fields = {}
    for key, entry in pairs(value) do fields[#fields + 1] = tostring(key) .. "=" .. dump(entry) end
    table.sort(fields)
    return "{" .. table.concat(fields, ",") .. "}"
end

local function instance(class)
    local object = FindFirstOf(class)
    assert(object and object:IsValid())
    assert(not object:GetFName():ToString():match("^Default__"))
    return object
end

local function import(object, class, field, value)
    local matched = false
    StaticFindObject("/Script/Dominion." .. class):ForEachProperty(function(property)
        if property:GetFName():ToString() == field then
            property:ImportText(value, property:ContainerPtrToValuePtr(object, 0), 0, object)
            matched = true
            return true
        end
    end)
    assert(matched, field)
    write("IMPORTED " .. class .. "." .. field)
end

local function clock_test()
    local actor = instance("InGameTimeActor")
    local function sample(label)
        write(label .. " StoredTime=" .. tostring(actor.StoredTime) .. " LastSyncTime=" .. tostring(actor.LastSyncTime) .. " GetInGameTime=" .. dump(actor:GetInGameTime()) .. " dayMinutes=" .. tostring(actor.RealTimeMinutesPerInGameDay) .. " paused=" .. tostring(actor.bIsTimePaused))
    end
    sample("before")
    assert(actor.RealTimeMinutesPerInGameDay == 24)
    actor:SetIsTimePaused(true)
    for _, ticks in ipairs({ 0, 432000000000, 1080000000000 }) do
        actor:SetInGameTime({ Ticks = ticks })
        assert(actor.StoredTime == ticks / 600000000)
        assert(math.abs(actor:GetInGameTime().Ticks - ticks) <= math.max(1, ticks * 0.0000002))
        sample("setTicks=" .. ticks)
    end
    local second = actor:ConvertRealTimeToInGameTime({ Ticks = 10000000 })
    local hour = actor:ConvertInGameTimeToRealTime({ Ticks = 36000000000 })
    assert(second.Ticks == 600000000 and hour.Ticks == 600000000)
    write("oneRealSecond=" .. dump(second))
    write("oneGameHour=" .. dump(hour))
end

local function progress_test()
    local actor = instance("WorldProgressManager")
    import(actor, "WorldProgressManager", "DefeatedBossesInternalNames", '("MagpieFixtureBoss","GeneralVelgar")')
    import(actor, "WorldProgressManager", "TaggedWorldProgressValues", '(((TagName="Location.Region.Brynmoor"),7.25),((TagName="Location.Region.Fellhollow"),-2.5))')
end

local function poi_test()
    local actor = instance("PoiDiscoverySystemActor")
    local function guid(value)
        return table.concat({value.A, value.B, value.C, value.D}, ",")
    end
    local function inspect(label)
        actor.PoiDiscoverySystemDataPerPlayer:ForEach(function(index, parameter)
            local data = parameter:get()
            write(label .. " player=" .. index .. " guid=" .. guid(data.PlayerCharacterGuid.InnerGuid))
            data.DiscoveredPois:ForEach(function(poi_index, poi)
                write(label .. " poi=" .. poi_index .. " guid=" .. guid(poi:get()))
            end)
        end)
    end
    inspect("restored")
    import(actor, "PoiDiscoverySystemActor", "PoiDiscoverySystemDataPerPlayer", "()")
    assert(actor.PoiDiscoverySystemDataPerPlayer:GetArrayNum() == 0)
    import(actor, "PoiDiscoverySystemActor", "PoiDiscoverySystemDataPerPlayer", '((PlayerCharacterGuid=(InnerGuid=(A=286331153,B=572662306,C=858993459,D=1145324612)),DiscoveredPois=((A=1431655765,B=1717986918,C=2004318071,D=-2004318072),(A=305419896,B=-1698898192,C=324508639,D=610839776))),(PlayerCharacterGuid=(InnerGuid=(A=1,B=2,C=3,D=4)),DiscoveredPois=((A=5,B=6,C=7,D=8))))')
    assert(actor.PoiDiscoverySystemDataPerPlayer:GetArrayNum() == 2)
    write("POI_ROWS " .. tostring(actor.PoiDiscoverySystemDataPerPlayer:GetArrayNum()))
    inspect("imported")
end

ExecuteWithDelay(45000, function()
    for name, test in pairs({ clock = clock_test, progress = progress_test, poi = poi_test }) do
        local ok, error = pcall(test)
        write(name .. (ok and " PASS" or " ERROR " .. tostring(error)))
    end
    write("SAVE_FIELDS_DONE")
    local stop = assert(io.open(assert(os.getenv("MAGPIE_STOP_FILE")), "w"))
    stop:write("stop\n")
    stop:close()
end)
