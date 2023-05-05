#!/usr/bin/env bash
set -euo pipefail
cd "${0%/*}"

declare LOG_ROOT
declare LICENSE_FILE
declare -r HOST_URL_PREFIX_DEFAULT="http://127.0.0.1"

function usage() {
    # TODO :)
    echo "Usage: run-example --license-file <license-file> [options] [cmd]"
    echo "  Options:"
    echo "    --log-root <log-dir> : where on the host to mount Norsk's logs.  The actual logs will be in a subdirectory with the name of the example you are running.  Default ./norskLogs"
    echo "    --network-mode [docker|host] : whether the example should run in host or docker network mode.  Defaults to host"
    echo "  Commands:"
    echo "    list : List the example names along with a short description of each"
    echo "    start <example-name> : start the named example"
    echo "    stop : Stops the last launched example with \`docker compose down\`"
    echo "    stop-all : Stops all example containers and deletes the associated docker network (if any)"
    echo "  Environment variables:"
    echo "    The run script allows the displayed URLs to have a custome URL root to"
    echo "    facilitate ease of viewing outputs / visualiser / documentation etc."
    echo "    HOST_URL_PREFIX - default: $HOST_URL_PREFIX_DEFAULT"
    exit 1
}

function dockerComposeCmd() {
    # Earlier version of docker-compose are called differently
    if ! docker compose >/dev/null 2>&1; then
        if ! docker-compose >/dev/null 2>&1; then
            echo "Unable to find docker-compose - exiting"
            exit 1
        else
            echo "docker-compose"
        fi
    else
        echo "docker compose"
    fi
}

function listExamples() {
    echo "here is the list of examples"
    exit 0
}

function startExample() {
    local -r exampleName=${1}
    local -r ymlPath=${2}
    local -r dockerComposeCmd=$(dockerComposeCmd || exit 1)

    local HOST_URL_PREFIX=${HOST_URL_PREFIX:-$HOST_URL_PREFIX_DEFAULT}
    mkdir -p "$LOG_ROOT/$exampleName"

    # Different versions of docker-compose treat paths inside yml files differently
    # (some consider paths relative to the yml file - other relative to where you run from)
    # As a result we soft link the selected yml file to the current directory to the
    # behaviour is the same in both cases.
    # It's also convient for `docker compose down`
    local -r dcFile="$ymlPath/${exampleName}.yml"
    if [ -f "$dcFile" ]; then
        rm -f docker-compose.yml
        cat "$dcFile" |
            sed -e 's#${LICENSE_FILE}#'"$(realpath "$LICENSE_FILE")"'#g' \
                -e 's#${LOG_ROOT}#'"$(realpath "$LOG_ROOT/$exampleName")"'#g' \
                >docker-compose.yml
    else
        echo "Error: example not found $exampleName"
        exit 1
    fi

    HOST_URL_PREFIX=$HOST_URL_PREFIX \
        LICENSE_FILE="$(realpath "$LICENSE_FILE")" \
        LOG_ROOT=$(realpath "$LOG_ROOT/$exampleName") \
        $dockerComposeCmd up --build --detach
    echo "Workflow visualiser URL $HOST_URL_PREFIX:6791/visualiser"
    sleep 1
    echo "Example app logs"
    docker logs norsk-example-app
    exit 0
}

function stopExample() {
    local -r dockerComposeCmd=$(dockerComposeCmd || exit 1)

    if [ -f docker-compose.yml ]; then
        $dockerComposeCmd down -t 1
        exit 0
    else
        stopAll
    fi
}

function stopAll() {
    local -ar matchingContainers=$(docker ps --all --filter name="^norsk-source" --filter name="^norsk-example" --filter name="norsk-server")
    echo $matchingContainers
    local -r matchingContainersCmd='docker ps --all --filter name="^norsk-source" --filter name="^norsk-example" --filter name="norsk-server"'
    local -r matchingNetworksCmd='docker network ls --filter name="^norsk-nw"'
    echo "Stopping the following containers"
    $matchingContainersCmd
    $matchingContainersCmd -q | xargs --no-run-if-empty docker rm -f
    echo
    echo "Deleting the following networks"
    $matchingNetworksCmd
    $matchingNetworksCmd -q | xargs --no-run-if-empty docker network rm
    exit 0
}

function main() {
    local -r opts=$(getopt -o h: --longoptions help,license-file:,log-root:,network-mode: -n "$0" -- "$@")
    local ymlPath
    local dockerComposeCmd

    # Defaults
    ymlPath="docker-compose/host-networking"
    LOG_ROOT="norskLogs"

    eval set -- "$opts"
    while true; do
        case "$1" in
        -h | --help)
            usage
            ;;
        --license-file)
            export LICENSE_FILE="$2"
            shift 2
            ;;
        --log-root)
            # Remove trailing slash if present
            export LOG_ROOT=${2%/}
            shift 2
            ;;
        --network-mode)
            case "$2" in
            docker)
                ymlPath="docker-compose/docker-networking"
                ;;
            host)
                ## Set in the default
                ;;
            *)
                echo "Unknown network-mode $2"
                exit 1
                ;;
            esac
            shift 2
            ;;
        --)
            shift
            break
            ;;
        *)
            break
            ;;
        esac
    done
    if [[ $# -eq 1 ]]; then
        case "$1" in
        list)
            listExamples
            exit 0
            ;;
        stop)
            stopExample
            exit 0
            ;;
        stop-all)
            stopAll
            exit 0
            ;;
        *)
            echo "Error: Unknown command $1"
            usage
            ;;
        esac
    fi

    if [[ -z ${LICENSE_FILE+x} ]]; then
        usage
    fi
    if [[ ! -f ${LICENSE_FILE} ]]; then
        echo "License file not found: ${LICENSE_FILE}"
        exit 1
    fi

    if [[ $# -eq 2 ]]; then
        case "$1" in
        start)
            startExample "$2" "$ymlPath"
            ;;
        *)
            echo "Error: Unknown command $1"
            usage
            ;;
        esac
    fi
}

main "$@"
