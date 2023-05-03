#!/usr/bin/env bash
set -euo pipefail
cd "${0%/*}"

declare LOG_ROOT
declare LICENSE_FILE

function usage() {
    # TODO :)
    echo "Usage: run-example --license-file <license-file> [options] [cmd]"
    echo Options:
    echo "  --log-root <log-dir> : where on the host to mount Norsk's logs.  The actual logs will be in a subdirectory with the name of the example you are running.  Default ./norskLogs"
    echo "  --network-mode [docker|host] : whether the example should run in host or docker network mode.  Defaults to host"
    echo Commands:
    echo "  list : List the example names along with a short description of each"
    echo "  stop : Stops all example containers and deletes the associated docker network (if any)"
    echo "  run <example-name> : run the named example"
    exit 1
}

function listExamples() {
    echo "here is the list of examples"
    exit 0
}

function runExample() {
    local -r exampleName=${1}
    local -r dockerComposeCmd=${2}
    local -r ymlPath=${3}
    mkdir -p "$LOG_ROOT/$exampleName"
    chmod 777 "$LOG_ROOT/$exampleName"

    LICENSE_FILE="$(realpath "$LICENSE_FILE")" \
    LOG_ROOT=$(realpath "$LOG_ROOT/$exampleName") \
        $dockerComposeCmd -f "$ymlPath/docker-compose.${exampleName}.yml" up --build --detach
        # TODO - print the logs / urls to visualizer etc
    exit 0
}

function stopExample() {
    docker ps --filter name="^norsk-source" --filter name="^norsk-example" --filter name="norsk-server" -q | xargs --no-run-if-empty docker rm -f
    docker network ls --filter name="^norsk-nw" -q | xargs --no-run-if-empty docker network rm
}

function main() {
    local -r opts=$(getopt -o h: --longoptions help,license-file:,log-root: -n "$0" -- "$@")
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

    # Earlier version of docker-compose are called differently
    if ! docker compose >/dev/null 2>&1; then
        if ! docker-compose >/dev/null 2>&1; then
            echo "Unable to find docker-compose - exiting"
            exit 1
        else
            dockerComposeCmd="docker-compose"
        fi
    else
        dockerComposeCmd="docker compose"
    fi

    if [[ $# -eq 2 ]]; then
        case "$1" in
        run)
            runExample "$2" "$dockerComposeCmd" "$ymlPath"
            ;;
        *)
            echo "Error: Unknown command $1"
            usage
            ;;
        esac
    fi

}

main "$@"
